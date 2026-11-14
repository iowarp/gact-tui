use super::*;

#[test]
fn english_covers_every_menu_label() {
    use crate::menu_spec::{Item, MENU_SPEC};
    fn walk(items: &[Item]) {
        for item in items {
            match item {
                Item::Action { id, .. } => assert!(
                    english(&format!("menu.item.{id}")).is_some(),
                    "menu item {id} has no native copy key"
                ),
                Item::Submenu { title, items } => {
                    assert!(english(&format!("menu.{title}")).is_some(), "submenu {title}");
                    walk(items);
                }
                _ => {}
            }
        }
    }
    for spec in MENU_SPEC.iter().skip(1) {
        assert!(english(&format!("menu.{}", spec.title)).is_some(), "menu {}", spec.title);
    }
    for spec in MENU_SPEC {
        walk(spec.items);
    }
}

#[test]
fn the_interface_sends_the_same_keys() {
    // The web module lists its keys literally; every one must be known here and
    // every key here must be sent, or a translation would be dropped silently.
    let source = include_str!("../../../web/src/tauri/native-copy.ts");
    for (key, _) in ENGLISH {
        assert!(source.contains(&format!("'{key}'")), "web/src/tauri/native-copy.ts lacks {key}");
    }
}

#[test]
fn fills_placeholders_and_keeps_unknown_ones() {
    assert_eq!(fill("Quit {name}", &[("name", "CLIO")]), "Quit CLIO");
    assert_eq!(
        fill("{name} could not be moved to {dest}", &[("name", "CLIO"), ("dest", "/Applications")]),
        "CLIO could not be moved to /Applications"
    );
    assert_eq!(fill("Move to {dest}", &[("name", "CLIO")]), "Move to {dest}");
}

#[test]
fn rejects_unknown_keys_and_translations_that_lose_a_placeholder() {
    let table = BTreeMap::from([
        ("tray.quit".to_owned(), "Salir de {name}".to_owned()),
        ("tray.show".to_owned(), "Mostrar".to_owned()),
        ("menu.item.reload".to_owned(), "Recargar".to_owned()),
        ("not.a.key".to_owned(), "x".to_owned()),
    ]);
    let kept = accepted(table);
    assert_eq!(kept.get("tray.quit").map(String::as_str), Some("Salir de {name}"));
    assert!(!kept.contains_key("tray.show"));
    assert_eq!(kept.get("menu.item.reload").map(String::as_str), Some("Recargar"));
    assert!(!kept.contains_key("not.a.key"));
}

#[test]
fn a_sent_table_replaces_english_and_an_empty_one_restores_it() {
    // One test owns the process-wide table so parallel tests never race on it.
    assert!(replace(BTreeMap::from([(
        "menu.item.reload".to_owned(),
        "Recargar".to_owned()
    )])));
    assert_eq!(text("menu.item.reload"), "Recargar");
    assert_eq!(text("menu.item.zoom-in"), "Zoom In");
    assert_eq!(format("tray.quit", &[("name", "CLIO")]), "Quit CLIO");
    assert!(!replace(BTreeMap::from([(
        "menu.item.reload".to_owned(),
        "Recargar".to_owned()
    )])));
    assert!(replace(BTreeMap::new()));
    assert_eq!(text("menu.item.reload"), "Reload");
}
