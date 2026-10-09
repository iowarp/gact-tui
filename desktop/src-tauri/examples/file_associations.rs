//! Read-only discovery evidence using the same implementation as the desktop menu.
#[allow(dead_code)]
#[path = "../src/blocking_command.rs"]
mod blocking_command;
#[allow(dead_code)]
#[path = "../src/document_apps.rs"]
mod document_apps;

fn main() -> Result<(), String> {
    let mut result = std::collections::BTreeMap::new();
    for name in [
        "file.md",
        "file.html",
        "file.pdf",
        "file.png",
        "file.csv",
        "file.docx",
    ] {
        result.insert(name, document_apps::discover(name, "")?);
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&result).map_err(|error| error.to_string())?
    );
    Ok(())
}
