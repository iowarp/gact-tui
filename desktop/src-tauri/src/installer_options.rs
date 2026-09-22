use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const INSTALLER_OPTIONS_FILE: &str = "installer-options.json";
const CURRENT_SCHEMA: u8 = 4;

/// Infrastructure choices recorded by the NSIS installer's "Infrastructure" page
/// (see `installer-hooks.nsh`) and read back once the desktop app first connects
/// to its managed backend (`finishInstallerInfrastructure` in the web layer).
///
/// `web_search` folds what used to be v1's separate `web_search: bool` +
/// `web_search_status: String` pair into one status string — "not_requested" now
/// carries both "wasn't asked for" and "false" in a single value. `llama_cpp` and
/// `clio_kit` are new in v2: the installer records a preference only (no llama.cpp
/// binary ships with the installer), and `clio_kit` is always "bundled" since the
/// science tool kit always ships in the installer image. v4 records individual
/// provider ids instead of coupling distinct products into provider families.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct InstallerOptions {
    pub schema: u8,
    pub web_search: String,
    pub llama_cpp: String,
    pub clio_kit: String,
    #[serde(default = "default_provider_ids")]
    pub provider_ids: String,
}

fn default_provider_ids() -> String {
    "codex,openai".into()
}

impl Default for InstallerOptions {
    fn default() -> Self {
        Self {
            schema: CURRENT_SCHEMA,
            web_search: "not_requested".into(),
            llama_cpp: "not_requested".into(),
            clio_kit: "bundled".into(),
            provider_ids: default_provider_ids(),
        }
    }
}

fn options_path(root: &Path) -> PathBuf {
    root.join(INSTALLER_OPTIONS_FILE)
}

/// Recognize a v1 installer-options.json (`{"version":1,"web_search":bool,
/// "web_search_status":str}`, written by installers before the Infrastructure
/// page existed) and migrate it into the current shape. v1 predates the
/// llama.cpp / clio-kit choices, so those take their defaults. Returns `None`
/// for anything that is not recognizably v1, so the caller falls through to a
/// direct schema migration or parse.
///
/// This is a pure data transform — no filesystem access — so it stays directly
/// unit-testable, and the migration itself is a named, tested function rather
/// than an implicit `unwrap_or_default` silently discarding a real prior choice.
fn migrate_v1(value: &Value) -> Option<InstallerOptions> {
    let is_v1 = value.get("version").and_then(Value::as_u64) == Some(1)
        && value.get("web_search").is_some_and(Value::is_boolean);
    if !is_v1 {
        return None;
    }
    let web_search = value
        .get("web_search_status")
        .and_then(Value::as_str)
        .unwrap_or("not_requested")
        .to_string();
    Some(InstallerOptions {
        schema: CURRENT_SCHEMA,
        web_search,
        llama_cpp: "not_requested".into(),
        clio_kit: "bundled".into(),
        provider_ids: default_provider_ids(),
    })
}

fn expand_legacy_provider_families(families: &str) -> String {
    let mut providers = Vec::new();
    for family in families.split(',').map(str::trim) {
        let members: &[&str] = match family {
            "openai" => &["codex", "openai"],
            "anthropic" => &["anthropic", "claude_code"],
            "google" => &["gemini", "vertex_ai"],
            "argonne" => &["argonne_sophia", "argonne_metis"],
            "local" => &["lm_studio", "ollama", "llama_cpp", "vllm"],
            "other" => &["azure_openai", "bedrock", "nvidia_nim", "openrouter"],
            _ => &[],
        };
        for provider in members {
            if !providers.contains(provider) {
                providers.push(*provider);
            }
        }
    }
    providers.join(",")
}

fn migrate_pre_v4(value: &Value) -> Option<InstallerOptions> {
    let schema = value.get("schema").and_then(Value::as_u64)?;
    if schema >= u64::from(CURRENT_SCHEMA) {
        return None;
    }
    let web_search = value
        .get("web_search")
        .and_then(Value::as_str)
        .unwrap_or("not_requested")
        .to_string();
    let llama_cpp = value
        .get("llama_cpp")
        .and_then(Value::as_str)
        .unwrap_or("not_requested")
        .to_string();
    let clio_kit = value
        .get("clio_kit")
        .and_then(Value::as_str)
        .unwrap_or("bundled")
        .to_string();
    let families = value
        .get("provider_families")
        .and_then(Value::as_str)
        .unwrap_or("openai");
    Some(InstallerOptions {
        schema: CURRENT_SCHEMA,
        web_search,
        llama_cpp,
        clio_kit,
        provider_ids: expand_legacy_provider_families(families),
    })
}

fn parse_options(contents: &str) -> Result<InstallerOptions, String> {
    let value: Value = serde_json::from_str(contents)
        .map_err(|error| format!("Installer choices are not valid: {error}"))?;
    if let Some(migrated) = migrate_v1(&value) {
        return Ok(migrated);
    }
    if let Some(migrated) = migrate_pre_v4(&value) {
        return Ok(migrated);
    }
    serde_json::from_value(value)
        .map_err(|error| format!("Installer choices are not valid: {error}"))
}

fn read_options(root: &Path) -> Result<InstallerOptions, String> {
    let path = options_path(root);
    if !path.exists() {
        return Ok(InstallerOptions::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read installer choices: {error}"))?;
    parse_options(&contents)
}

fn write_options(root: &Path, options: &InstallerOptions) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("Could not prepare desktop settings: {error}"))?;
    let path = options_path(root);
    let temporary = root.join(format!("{INSTALLER_OPTIONS_FILE}.tmp"));
    let contents = serde_json::to_vec_pretty(options)
        .map_err(|error| format!("Could not encode installer choices: {error}"))?;
    fs::write(&temporary, contents)
        .map_err(|error| format!("Could not save installer choices: {error}"))?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not replace installer choices: {error}"))?;
    }
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finalize installer choices: {error}"))
}

fn app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|error| format!("Could not locate desktop settings: {error}"))
}

/// Read the optional infrastructure choices recorded by the desktop installer.
#[tauri::command]
pub fn read_installer_options(app: tauri::AppHandle) -> Result<InstallerOptions, String> {
    read_options(&app_data_root(&app)?)
}

/// Mark the install-selected Web Search setup as registered with CLIO.
#[tauri::command]
pub fn complete_installer_web_search(app: tauri::AppHandle) -> Result<(), String> {
    let root = app_data_root(&app)?;
    let mut options = read_options(&root)?;
    if options.web_search == "not_requested" {
        return Err("Web Search was not selected during installation.".into());
    }
    options.web_search = "configured".into();
    write_options(&root, &options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("clio-installer-options-{suffix}"))
    }

    #[test]
    fn missing_installer_options_are_not_requested() {
        let root = test_root();
        assert_eq!(read_options(&root).unwrap(), InstallerOptions::default());
    }

    #[test]
    fn installer_options_v4_roundtrip() {
        let root = test_root();
        let options = InstallerOptions {
            schema: 4,
            web_search: "deployed".into(),
            llama_cpp: "requested".into(),
            clio_kit: "bundled".into(),
            provider_ids: "codex,openai,argonne_sophia".into(),
        };
        write_options(&root, &options).unwrap();
        assert_eq!(read_options(&root).unwrap(), options);

        let configured = InstallerOptions {
            web_search: "configured".into(),
            ..options
        };
        write_options(&root, &configured).unwrap();
        assert_eq!(read_options(&root).unwrap(), configured);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn installer_options_v1_migrates_to_current() {
        let root = test_root();
        fs::create_dir_all(&root).unwrap();
        fs::write(
            options_path(&root),
            r#"{"version":1,"web_search":true,"web_search_status":"deployed"}"#,
        )
        .unwrap();

        assert_eq!(
            read_options(&root).unwrap(),
            InstallerOptions {
                schema: 4,
                web_search: "deployed".into(),
                llama_cpp: "not_requested".into(),
                clio_kit: "bundled".into(),
                provider_ids: "codex,openai".into(),
            }
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn installer_options_v1_not_requested_migrates_cleanly() {
        let root = test_root();
        fs::create_dir_all(&root).unwrap();
        fs::write(
            options_path(&root),
            r#"{"version":1,"web_search":false,"web_search_status":"not_requested"}"#,
        )
        .unwrap();

        assert_eq!(read_options(&root).unwrap(), InstallerOptions::default());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn v1_migration_defaults_a_missing_status_to_not_requested() {
        // A hand-edited or truncated v1 file that dropped web_search_status must
        // not panic or surface an internal Option — it degrades to the same
        // "not_requested" default a missing file gets.
        let value: Value = serde_json::from_str(r#"{"version":1,"web_search":true}"#).unwrap();
        let migrated = migrate_v1(&value).expect("recognized as v1");
        assert_eq!(migrated.web_search, "not_requested");
        assert_eq!(migrated.llama_cpp, "not_requested");
        assert_eq!(migrated.clio_kit, "bundled");
        assert_eq!(migrated.provider_ids, "codex,openai");
    }

    #[test]
    fn a_v2_shaped_value_is_not_mistaken_for_v1() {
        // v2's web_search is a string, not a bool — migrate_v1 must key off the
        // actual v1 shape (version:1 AND a boolean web_search), not just the
        // presence of a "version"-like field, or a genuine v2 file would be
        // silently reinterpreted and lose its llama_cpp/clio_kit fields.
        let value: Value = serde_json::from_str(
            r#"{"schema":2,"web_search":"deployed","llama_cpp":"requested","clio_kit":"bundled"}"#,
        )
        .unwrap();
        assert!(migrate_v1(&value).is_none());
    }

    #[test]
    fn v3_provider_families_migrate_to_individual_provider_ids() {
        let value: Value = serde_json::from_str(
            r#"{"schema":3,"web_search":"not_requested","llama_cpp":"not_requested","clio_kit":"bundled","provider_families":"anthropic,argonne"}"#,
        )
        .unwrap();
        let migrated = migrate_pre_v4(&value).expect("recognized as pre-v4");
        assert_eq!(migrated.schema, 4);
        assert_eq!(
            migrated.provider_ids,
            "anthropic,claude_code,argonne_sophia,argonne_metis"
        );
    }

    #[test]
    fn corrupt_installer_options_surface_a_readable_error_instead_of_panicking() {
        let root = test_root();
        fs::create_dir_all(&root).unwrap();
        fs::write(options_path(&root), b"{not json").unwrap();

        let error = read_options(&root).unwrap_err();
        assert!(error.contains("not valid"), "unexpected error: {error}");
        let _ = fs::remove_dir_all(root);
    }
}
