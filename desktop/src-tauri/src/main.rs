// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    if std::env::args_os().any(|arg| arg == "--prepare-runtime") {
        if let Err(report) = clio_desktop_lib::prepare_runtime_command() {
            eprintln!("{report}");
            std::process::exit(1);
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
