use crate::supervisor_boot_log::boot_log_line;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Once;
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
///
/// `provider_ids` is `None` when there is no recorded installer preference at
/// all — a missing/unreadable installer-options file, or a schema migrated
/// from a version that never recorded providers (v1, or pre-v4 with no
/// `provider_families`). It is `Some("")` for a schema-4 file that recorded
/// an explicit empty provider list: this is current, live behavior for a
/// genuinely unattended `/S` install (the wizard never ran, so nothing was
/// asked), and can also still exist on disk from a pre-fix installer run
/// whose Leave validation once let an empty wizard selection through. The
/// web layer treats both `None` and `Some("")` as "no installer preference"
/// (leave provider visibility untouched), but logs a different reason for
/// each — see `resolveInstallerProviderSelection` in
/// `installer-infrastructure.ts`.
///
/// `installed_at` is the NSIS-stamped install timestamp (added alongside this
/// fix). It is the "installer-options revision" the web layer compares
/// against localStorage to apply provider visibility exactly once per real
/// install (`applyInstallerProviderVisibility` in `installer-infrastructure.ts`).
/// It is `None` for files written before this field existed.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct InstallerOptions {
    pub schema: u8,
    pub web_search: String,
    pub llama_cpp: String,
    pub clio_kit: String,
    #[serde(default)]
    pub provider_ids: Option<String>,
    #[serde(default)]
    pub installed_at: Option<String>,
}

impl Default for InstallerOptions {
    fn default() -> Self {
        Self {
            schema: CURRENT_SCHEMA,
            web_search: "not_requested".into(),
            llama_cpp: "not_requested".into(),
            clio_kit: "bundled".into(),
            provider_ids: None,
            installed_at: None,
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
        // v1 predates per-provider visibility entirely — there is no
        // recorded preference to migrate, not a "codex,openai" default.
        provider_ids: None,
        installed_at: None,
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
        provider_ids: Some(expand_legacy_provider_families(families)),
        // Pre-v4 schemas never recorded an install timestamp.
        installed_at: None,
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

/// Fires the "installer options file absent" boot-log line at most once per
/// process. `read_installer_options` is invoked on every managed-backend
/// connect, and a missing file (the common case for anyone who never chose
/// to record a preference) would otherwise write a duplicate line to the
/// persisted boot log on every single one.
static ABSENT_LOGGED_ONCE: Once = Once::new();

fn log_absent_once() {
    ABSENT_LOGGED_ONCE.call_once(|| {
        boot_log_line(
            "installer options file absent — no installer provider preference recorded, \
             leaving provider visibility untouched",
        );
    });
}

/// The three distinguishable outcomes of trying to read installer-options.json.
/// Kept separate from the degraded [`InstallerOptions`] value that most
/// callers want (see [`read_options`]) because at least one caller
/// (`complete_installer_web_search`) needs to tell "genuinely never recorded"
/// apart from "present but failed to read" — the latter is a real problem
/// that must surface as an error, not be silently reinterpreted as "Web
/// Search was not selected."
enum OptionsReadOutcome {
    Present(InstallerOptions),
    Missing,
    Unreadable(String),
}

fn read_options_outcome(root: &Path) -> Result<OptionsReadOutcome, String> {
    let path = options_path(root);
    if !path.exists() {
        log_absent_once();
        return Ok(OptionsReadOutcome::Missing);
    }
    match fs::read_to_string(&path) {
        Ok(contents) => parse_options(&contents).map(OptionsReadOutcome::Present),
        Err(error) => {
            let message = format!("Could not read installer choices: {error}");
            boot_log_line(&format!(
                "installer options file unreadable ({error}) — no installer provider \
                 preference recorded, leaving provider visibility untouched"
            ));
            Ok(OptionsReadOutcome::Unreadable(message))
        }
    }
}

/// Read the installer's recorded choices, degrading to "no installer
/// preference" (the typed [`InstallerOptions::default`], with
/// `provider_ids: None`) when the file is missing or cannot be read at all —
/// never a silent `codex,openai` guess. Both cases are logged to the desktop
/// boot log (the "absent" reason at most once per process — see
/// [`log_absent_once`]) so the reason is visible after the fact, per the
/// no-silent-fallback rule.
///
/// A file that IS readable but contains invalid JSON is a different, louder
/// failure (`corrupt_installer_options_surface_a_readable_error_instead_of_panicking`):
/// that still returns `Err`, since a corrupt file is evidence of a real
/// problem rather than "nobody set a preference." This is the right
/// degradation for most callers (e.g. provider visibility, where "we
/// couldn't read it" and "nobody set one" both mean "leave it alone"), but
/// `complete_installer_web_search` needs the finer-grained
/// [`read_options_outcome`] instead — see [`complete_web_search_at`].
fn read_options(root: &Path) -> Result<InstallerOptions, String> {
    match read_options_outcome(root)? {
        OptionsReadOutcome::Present(options) => Ok(options),
        OptionsReadOutcome::Missing | OptionsReadOutcome::Unreadable(_) => {
            Ok(InstallerOptions::default())
        }
    }
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
    complete_web_search_at(&app_data_root(&app)?)
}

/// The testable body of [`complete_installer_web_search`], taking a plain
/// root path instead of a `tauri::AppHandle`.
///
/// A missing file genuinely means "Web Search was never requested" — that is
/// an accurate, user-facing error. A present-but-unreadable file is a
/// different problem (a corrupted or inaccessible installer-options.json)
/// and must surface its real read error instead: silently reinterpreting it
/// as "not selected" would send the user to redo an installer choice when
/// the actual fix is something else entirely.
fn complete_web_search_at(root: &Path) -> Result<(), String> {
    let mut options = match read_options_outcome(root)? {
        OptionsReadOutcome::Present(options) => options,
        OptionsReadOutcome::Missing => InstallerOptions::default(),
        OptionsReadOutcome::Unreadable(message) => return Err(message),
    };
    if options.web_search == "not_requested" {
        return Err("Web Search was not selected during installation.".into());
    }
    options.web_search = "configured".into();
    write_options(root, &options)
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
        let options = read_options(&root).unwrap();
        assert_eq!(options, InstallerOptions::default());
        // The typed absence, not a synthesized "codex,openai" guess — the web
        // layer must be able to tell "nobody chose" from "an explicit empty
        // choice" apart.
        assert_eq!(options.provider_ids, None);
        assert_eq!(options.installed_at, None);
    }

    #[test]
    fn unreadable_installer_options_degrade_to_absent_instead_of_erroring() {
        // A directory at the options path is not valid UTF-8 file content but
        // still reports `exists() == true`; fs::read_to_string fails on it on
        // every desktop OS, exercising the "unreadable" branch (distinct from
        // "missing" and from "readable but corrupt JSON") without needing
        // OS-specific permission APIs.
        let root = test_root();
        fs::create_dir_all(options_path(&root)).unwrap();

        let options = read_options(&root).unwrap();
        assert_eq!(options, InstallerOptions::default());
        assert_eq!(options.provider_ids, None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_installer_options_return_absent_on_every_call_even_after_the_log_fires_once() {
        // Boot-logging the "file absent" reason only once per process (to
        // avoid spamming the log on every connect) must never affect the
        // FUNCTIONAL result — every call still needs the typed absent
        // InstallerOptions, on this root and on a completely different one.
        let root_a = test_root();
        let root_b = test_root();
        assert_eq!(read_options(&root_a).unwrap(), InstallerOptions::default());
        assert_eq!(read_options(&root_a).unwrap(), InstallerOptions::default());
        assert_eq!(read_options(&root_b).unwrap(), InstallerOptions::default());
    }

    #[test]
    fn complete_web_search_reports_not_selected_when_the_file_is_genuinely_missing() {
        let root = test_root();
        let error = complete_web_search_at(&root).unwrap_err();
        assert!(error.contains("was not selected"), "got: {error}");
    }

    #[test]
    fn complete_web_search_surfaces_the_real_error_for_an_unreadable_file_instead_of_not_selected()
    {
        // A present-but-unreadable file is a different failure than "nobody
        // requested Web Search" — masking it as "was not selected" would
        // send the user to redo a choice instead of fixing the real problem
        // (a corrupted/inaccessible installer-options.json).
        let root = test_root();
        fs::create_dir_all(options_path(&root)).unwrap();

        let error = complete_web_search_at(&root).unwrap_err();
        assert!(
            !error.contains("was not selected"),
            "must not mask a read failure as 'not selected', got: {error}"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn installer_options_v4_roundtrip_with_every_known_provider() {
        let root = test_root();
        let all_provider_ids = "codex,claude_code,openai,anthropic,gemini,vertex_ai,lm_studio,\
             ollama,llama_cpp,vllm,argonne_sophia,argonne_metis,azure_openai,bedrock,\
             nvidia_nim,openrouter";
        let options = InstallerOptions {
            schema: 4,
            web_search: "deployed".into(),
            llama_cpp: "requested".into(),
            clio_kit: "bundled".into(),
            provider_ids: Some(all_provider_ids.into()),
            installed_at: Some("20260923215032".into()),
        };
        write_options(&root, &options).unwrap();
        let read_back = read_options(&root).unwrap();
        assert_eq!(read_back, options);
        // Every selected id must survive the round trip verbatim — this is
        // the Rust half of the "claude/ALCF went missing" chain: nothing here
        // truncates the string, rejects schema 4, or filters by an allowlist.
        assert_eq!(
            read_back.provider_ids.as_deref(),
            Some(all_provider_ids),
            "a provider id was dropped or reordered by the Rust read path"
        );

        let configured = InstallerOptions {
            web_search: "configured".into(),
            ..options
        };
        write_options(&root, &configured).unwrap();
        assert_eq!(read_options(&root).unwrap(), configured);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn installed_at_revision_is_read_back_verbatim() {
        // installed_at is the "installer-options revision" the web layer
        // stamps into localStorage to apply visibility exactly once per
        // install (see installer-infrastructure.ts). The Rust side must not
        // normalize, truncate, or drop it.
        let root = test_root();
        let first_install = InstallerOptions {
            provider_ids: Some("claude_code".into()),
            installed_at: Some("20260101120000".into()),
            ..InstallerOptions::default()
        };
        write_options(&root, &first_install).unwrap();
        assert_eq!(
            read_options(&root).unwrap().installed_at.as_deref(),
            Some("20260101120000")
        );

        let reinstall = InstallerOptions {
            installed_at: Some("20260923215032".into()),
            ..first_install
        };
        write_options(&root, &reinstall).unwrap();
        assert_eq!(
            read_options(&root).unwrap().installed_at.as_deref(),
            Some("20260923215032"),
            "a reinstall must stamp a new, distinguishable revision"
        );
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
                provider_ids: None,
                installed_at: None,
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
        assert_eq!(migrated.provider_ids, None);
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
            migrated.provider_ids.as_deref(),
            Some("anthropic,claude_code,argonne_sophia,argonne_metis")
        );
        assert_eq!(migrated.installed_at, None);
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
