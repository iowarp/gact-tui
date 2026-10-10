//! Bounded live review of the production native staging, associations, and folder actions.
#[allow(dead_code)]
#[path = "../src/blocking_command.rs"]
mod blocking_command;
#[allow(dead_code)]
#[path = "../src/document_apps.rs"]
mod document_apps;
#[allow(dead_code)]
#[path = "../src/document_path.rs"]
mod document_path;
#[path = "../src/file_reveal.rs"]
mod file_reveal;

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).is_some_and(|action| action == "inventory") {
        let mut inventory = std::collections::BTreeMap::new();
        for name in ["raccoon.html", "model.gltf"] {
            inventory.insert(name, document_apps::discover(name, "")?);
        }
        println!(
            "{}",
            serde_json::to_string(&inventory).map_err(|error| error.to_string())?
        );
        return Ok(());
    }
    if args.len() < 4 {
        return Err("Usage: document_actions <open|reveal> <source file> <review staging root> [registered app name]".into());
    }
    let source = std::path::Path::new(&args[2]);
    let name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid filename")?;
    let bytes = std::fs::read(source).map_err(|error| error.to_string())?;
    let root = std::path::Path::new(&args[3]);
    let result = match args[1].as_str() {
        "open" => {
            let app_name = args.get(4).ok_or("A registered app name is required")?;
            let app = document_apps::discover(name, "")?
                .into_iter()
                .find(|app| &app.name == app_name)
                .ok_or("The requested app is not registered for this format")?;
            document_apps::open_file_bytes_in(root, name, &bytes, &app.id)?
        }
        "reveal" => document_apps::reveal_file_bytes_in(root, name, &bytes)?,
        _ => return Err("Unknown action".into()),
    };
    println!("{result}");
    Ok(())
}
