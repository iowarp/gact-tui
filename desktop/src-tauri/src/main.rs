// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    if std::env::args_os().any(|arg| arg == "--prepare-runtime") {
        if let Err(error) = clio_desktop_lib::prepare_runtime_for_install() {
            if let Ok(executable) = std::env::current_exe() {
                if let Some(install_dir) = executable.parent() {
                    let data_dir = install_dir.join("data");
                    let _ = std::fs::create_dir_all(&data_dir);
                    let _ = std::fs::write(
                        data_dir.join("runtime-install-error.log"),
                        format!("{error}\n"),
                    );
                }
            }
            eprintln!("CLIO runtime installation failed: {error}");
            std::process::exit(1);
        }
        if let Ok(executable) = std::env::current_exe() {
            if let Some(install_dir) = executable.parent() {
                let _ = std::fs::remove_file(install_dir.join("data/runtime-install-error.log"));
            }
        }
        return;
    }
    #[cfg(windows)]
    if std::env::args_os().any(|arg| arg == "--remove-managed-storage") {
        if let Err(error) = clio_desktop_lib::remove_managed_storage_for_uninstall() {
            eprintln!("CLIO runtime removal failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    clio_desktop_lib::run();
}
