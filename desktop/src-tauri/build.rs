fn main() {
    tauri_build::build();
    // Tauri embeds Common Controls v6 into the application binary. Native
    // acceptance examples need that activation context as well.
    if std::env::var("TARGET").is_ok_and(|target| target.ends_with("windows-msvc")) {
        let manifest = std::path::PathBuf::from(
            std::env::var("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"),
        )
        .join("examples/downloads_acceptance.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg-examples=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-examples=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}
