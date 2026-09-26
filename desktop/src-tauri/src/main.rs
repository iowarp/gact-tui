// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    {
        let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
        if let Some(flag) = args.iter().position(|arg| arg == "--stop-managed-runtime") {
            let Some(root) = args.get(flag + 1) else {
                println!("result=missing_install_dir");
                std::process::exit(64);
            };
            match clio_desktop_lib::stop_managed_runtime_command(std::path::Path::new(root)) {
                Ok(outcome) => println!("{outcome}"),
                Err(outcome) => {
                    println!("{outcome}");
                    std::process::exit(2);
                }
            }
            return;
        }
    }
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
