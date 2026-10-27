//! The `--prepare-runtime` step on macOS and Linux: everything a first launch
//! would otherwise do before the agent starts (the bundled runtime, the
//! workspace and user folders, the managed tool packages), done right after
//! installation, as the Windows installer already does.
//!
//! It resolves the same folders the app resolves at launch, without starting
//! the app: no window, no display needed, so the install script can run it.

use std::path::PathBuf;
use std::time::Instant;

use crate::{brand_backend, execution_install, runtime_pack, sidecar_setup};

/// The platform's per-user local data folder, as the app's path resolver uses it.
fn data_local_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
        .ok_or("HOME is not set, so the per-user data folder is unknown")?;
    if cfg!(target_os = "macos") {
        return Ok(home.join("Library/Application Support"));
    }
    Ok(std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .unwrap_or_else(|| home.join(".local/share")))
}

fn prepare() -> Result<(), String> {
    let started = Instant::now();
    if !brand_backend::is_managed_install() {
        return Err(
            "this desktop connects to an agent installed separately; there is nothing to prepare"
                .into(),
        );
    }
    let context = crate::app_context();
    let resource_dir =
        tauri::utils::platform::resource_dir(context.package_info(), &tauri::Env::default())
            .map_err(|error| format!("resolve the desktop's resource folder: {error}"))?;
    let app_data = data_local_dir()?.join(&context.config().identifier);
    let managed_storage = sidecar_setup::prepare_managed_storage_root(&resource_dir, &app_data)
        .map_err(|error| format!("prepare managed storage: {error}"))?;
    let runtime = runtime_pack::prepare_bundled_runtime(&resource_dir, &managed_storage)?
        .ok_or("this desktop package does not carry its agent runtime")?;
    println!(
        "Installer checkpoint: bundled runtime ready {:.3}s",
        started.elapsed().as_secs_f64()
    );
    let workspace = sidecar_setup::prepare_desktop_workspace(&managed_storage)
        .map_err(|error| format!("prepare the desktop workspace: {error}"))?;
    let user = sidecar_setup::prepare_desktop_user_dir(&managed_storage)
        .map_err(|error| format!("prepare desktop storage: {error}"))?;
    execution_install::prepare_packages_for_install(&runtime, &workspace, &user)?;
    println!(
        "Installer checkpoint: managed packages ready {:.3}s",
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

/// Run the step; on failure the text says what failed. A later launch repeats
/// whatever did not finish, so a failure here never leaves the app unusable.
pub fn prepare_runtime_command() -> Result<(), String> {
    prepare().map_err(|error| format!("Desktop setup did not finish: {error}"))
}

#[cfg(test)]
mod tests {
    use super::data_local_dir;
    use std::path::PathBuf;

    #[test]
    #[cfg(target_os = "linux")]
    fn data_folder_follows_xdg_then_home() {
        // One test owns these variables, so the cases cannot race each other.
        let (home, xdg) = (std::env::var_os("HOME"), std::env::var_os("XDG_DATA_HOME"));
        std::env::set_var("HOME", "/home/someone");
        std::env::set_var("XDG_DATA_HOME", "/data/someone");
        assert_eq!(data_local_dir().unwrap(), PathBuf::from("/data/someone"));
        std::env::set_var("XDG_DATA_HOME", "relative/ignored");
        assert_eq!(
            data_local_dir().unwrap(),
            PathBuf::from("/home/someone/.local/share")
        );
        std::env::remove_var("XDG_DATA_HOME");
        assert_eq!(
            data_local_dir().unwrap(),
            PathBuf::from("/home/someone/.local/share")
        );
        std::env::remove_var("HOME");
        assert!(data_local_dir().is_err());
        match home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        if let Some(value) = xdg {
            std::env::set_var("XDG_DATA_HOME", value);
        }
    }
}
