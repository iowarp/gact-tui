use super::*;

/// The cross-language single source of truth for menu action ids lives in
/// `web/src/tauri/menu-actions.json`. We embed it at compile time so the Rust
/// MENU_SPEC is validated against the very same file the web dispatcher reads
/// — neither side can drift without failing a test on one of the two ends.
const MENU_ACTIONS_JSON: &str = include_str!("../../../web/src/tauri/menu-actions.json");

#[derive(serde::Deserialize)]
struct MenuActionsSpec {
    actions: Vec<String>,
}

/// The exact action-ids the JS side will switch on, parsed from the shared
/// `menu-actions.json` single source of truth.
fn expected_actions() -> Vec<String> {
    serde_json::from_str::<MenuActionsSpec>(MENU_ACTIONS_JSON)
        .expect("menu-actions.json must be valid JSON with an `actions` array")
        .actions
}

fn all_action_ids() -> Vec<&'static str> {
    MENU_SPEC
        .iter()
        .flat_map(|s| s.items.iter())
        .filter_map(|i| match i {
            Item::Action { id, .. } => Some(*id),
            _ => None,
        })
        .collect()
}

/// Action ids handled entirely natively in Rust and never dispatched to the
/// JS `clio:menu` bridge — see `handle_menu_event`. Deliberately absent from
/// `menu-actions.json`, which is specifically the JS dispatcher's contract.
const NATIVE_ONLY_ACTION_IDS: &[&str] = &["quit"];

/// [`all_action_ids`] filtered down to the ids actually bridged to JS, for
/// comparison against the shared `menu-actions.json` contract.
fn bridged_action_ids() -> Vec<&'static str> {
    all_action_ids()
        .into_iter()
        .filter(|id| !NATIVE_ONLY_ACTION_IDS.contains(id))
        .collect()
}

/// Table-driven: every actionable, JS-bridged item id maps to its action-id
/// and the bridged action-id set is exactly the documented contract.
#[test]
fn action_map_covers_every_actionable_item() {
    let expected = expected_actions();
    for id in &expected {
        assert_eq!(
            action_for_id(id),
            Some(id.as_str()),
            "actionable id {id:?} must map to its action-id"
        );
    }

    let expected_refs: Vec<&str> = expected.iter().map(String::as_str).collect();
    assert_eq!(
        bridged_action_ids(),
        expected_refs,
        "MENU_SPEC's JS-bridged action ids drifted from the shared menu-actions.json contract"
    );
}

/// Quit resolves to an action (unlike predefined/unknown ids below) but is
/// handled entirely natively via `request_quit`, so it must stay out of the
/// JS-bridged `menu-actions.json` contract.
#[test]
fn quit_is_a_native_only_action_not_bridged_to_js() {
    assert_eq!(action_for_id("quit"), Some("quit"));
    assert!(
        all_action_ids().contains(&"quit"),
        "quit must be a real Item::Action in MENU_SPEC"
    );
    assert!(
        !expected_actions().iter().any(|id| id == "quit"),
        "quit must stay out of menu-actions.json: request_quit handles it natively, \
         it is never dispatched to the JS clio:menu bridge"
    );
}

/// Predefined and unknown ids must not map to an action.
#[test]
fn predefined_and_unknown_ids_have_no_action() {
    for id in [
        "undo",
        "redo",
        "cut",
        "copy",
        "paste",
        "select-all",
        "show", // tray item id from lib.rs
        "totally-bogus",
        "",
    ] {
        assert_eq!(
            action_for_id(id),
            None,
            "id {id:?} must not resolve to an action"
        );
    }
}

/// The spec has exactly four top-level submenus, in order, with the documented
/// per-submenu item counts.
#[test]
fn spec_has_four_submenus_with_expected_item_counts() {
    let titles: Vec<&str> = MENU_SPEC.iter().map(|s| s.title).collect();
    assert_eq!(titles, vec!["File", "Edit", "View", "Help"]);

    let expected_counts = [
        ("File", 7), // new, import, export, sep, settings, sep, quit
        ("Edit", 7), // undo, redo, sep, cut, copy, paste, select-all
        ("View", 8), // inspector, sessions, density, sep, palette, shortcuts, sep, fullscreen
        ("Help", 2), // docs, about
    ];
    assert_eq!(MENU_SPEC.len(), expected_counts.len());
    for (spec, (title, count)) in MENU_SPEC.iter().zip(expected_counts) {
        assert_eq!(spec.title, title);
        assert_eq!(spec.items.len(), count, "{title} submenu item count");
    }
}

/// Edit is entirely predefined (native clipboard/undo), and Quit lives in
/// File as a native-only action (not `Item::Predefined` — see
/// `Predefined`'s doc comment for why).
#[test]
fn edit_is_all_predefined_and_quit_is_a_native_action() {
    let edit = MENU_SPEC.iter().find(|s| s.title == "Edit").unwrap();
    assert!(
        edit.items
            .iter()
            .all(|i| matches!(i, Item::Predefined(_) | Item::Separator)),
        "every Edit item must be predefined (or a separator)"
    );
    assert!(
        !edit.items.iter().any(|i| matches!(i, Item::Action { .. })),
        "Edit must not contain any actionable items"
    );

    let file = MENU_SPEC.iter().find(|s| s.title == "File").unwrap();
    assert!(
        file.items
            .iter()
            .any(|i| matches!(i, Item::Action { id, .. } if *id == "quit")),
        "File must contain the native quit action"
    );
}

/// Accelerators match the documented contract for the items that have one.
#[test]
fn accelerators_match_contract() {
    let want: &[(&str, &str)] = &[
        ("new-session", "CmdOrCtrl+N"),
        ("export-session", "CmdOrCtrl+S"),
        ("open-settings", "CmdOrCtrl+Comma"),
        ("toggle-inspector", "CmdOrCtrl+I"),
        ("toggle-sessions", "CmdOrCtrl+Shift+B"),
        ("cycle-density", "Ctrl+O"),
        ("command-palette", "CmdOrCtrl+K"),
        ("keyboard-shortcuts", "CmdOrCtrl+/"),
        ("fullscreen", "F11"),
        ("quit", "CmdOrCtrl+Q"),
    ];
    for (id, accel) in want {
        let found = MENU_SPEC
            .iter()
            .flat_map(|s| s.items.iter())
            .find_map(|i| match i {
                Item::Action {
                    id: aid, accel: a, ..
                } if aid == id => Some(*a),
                _ => None,
            })
            .unwrap_or_else(|| panic!("missing actionable item {id:?}"));
        assert_eq!(found, Some(*accel), "accelerator for {id:?}");
    }
}

/// No duplicate action ids across the whole menu.
#[test]
fn action_ids_are_unique() {
    let ids = all_action_ids();
    let mut sorted = ids.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), ids.len(), "duplicate action id in MENU_SPEC");
}
