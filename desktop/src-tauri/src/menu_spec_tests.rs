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

/// The ids the JS product-action bus (`dispatchMenuAction`/`useMenuAction`)
/// recognizes, parsed from the shared `menu-actions.json` contract. This set
/// is a SUPERSET of what the native macOS menu bridges: the hamburger app
/// menu in `desktop-title-bar.tsx` dispatches some of these ids directly
/// (e.g. `new-session`, `help-docs`), on every platform, independent of
/// whether a native menu exists at all.
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

/// Table-driven: every actionable, JS-bridged item id maps to its own
/// action-id, and every one of them is a real entry in the shared
/// `menu-actions.json` contract — a native menu event the JS dispatcher
/// would reject as unknown (see `useNativeMenuBridge`'s `knownActions`
/// guard) is a bug. `menu-actions.json` may list MORE ids than the native
/// menu bridges (see `expected_actions`), so this is a subset check, not an
/// exact-equality one.
#[test]
fn action_map_covers_every_actionable_item() {
    let expected = expected_actions();
    for id in &expected {
        // Not every JSON id has to resolve — only the ones MENU_SPEC
        // actually declares. The reverse direction (below) is what matters:
        // every id MENU_SPEC bridges must be one JSON already knows.
        if let Some(resolved) = action_for_id(id) {
            assert_eq!(
                resolved,
                id.as_str(),
                "actionable id {id:?} must map to itself"
            );
        }
    }

    let expected_refs: Vec<&str> = expected.iter().map(String::as_str).collect();
    for bridged in bridged_action_ids() {
        assert!(
            expected_refs.contains(&bridged),
            "MENU_SPEC bridges {bridged:?} to JS, but it is missing from menu-actions.json \
             — the JS dispatcher would silently drop a real native menu event"
        );
    }
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
        "hide",
        "hide-others",
        "show-all",
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

/// The native macOS menu no longer carries a File, View, or Help submenu:
/// everything that used to live there is reachable through the
/// product-owned title bar's hamburger menu on every platform instead (see
/// `web/src/components/clio/desktop-title-bar.tsx`). The menu is trimmed to
/// just what macOS itself expects an app to own — the application menu and
/// Edit.
#[test]
fn menu_spec_has_no_file_view_help() {
    let titles: Vec<&str> = MENU_SPEC.iter().map(|s| s.title).collect();
    for banned in ["File", "View", "Help"] {
        assert!(
            !titles.contains(&banned),
            "the {banned} submenu must not exist in MENU_SPEC"
        );
    }
}

/// The spec has exactly two top-level submenus, in order, with the
/// documented per-submenu item counts.
#[test]
fn spec_has_two_submenus_with_expected_item_counts() {
    let titles: Vec<&str> = MENU_SPEC.iter().map(|s| s.title).collect();
    assert_eq!(titles, vec!["App", "Edit"]);

    let expected_counts = [
        ("App", 9),  // about, sep, settings, sep, hide, hide-others, show-all, sep, quit
        ("Edit", 7), // undo, redo, sep, cut, copy, paste, select-all
    ];
    assert_eq!(MENU_SPEC.len(), expected_counts.len());
    for (spec, (title, count)) in MENU_SPEC.iter().zip(expected_counts) {
        assert_eq!(spec.title, title);
        assert_eq!(spec.items.len(), count, "{title} submenu item count");
    }
}

/// Edit is entirely predefined (native clipboard/undo), and Quit lives in
/// the application menu as a native-only action (not `Item::Predefined` —
/// see `Predefined`'s doc comment for why).
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

    let app_menu = MENU_SPEC.iter().find(|s| s.title == "App").unwrap();
    assert!(
        app_menu
            .items
            .iter()
            .any(|i| matches!(i, Item::Action { id, .. } if *id == "quit")),
        "the application menu must contain the native quit action"
    );
}

/// The application menu is, in order: About, a separator, Settings, a
/// separator, the Hide/Hide-Others/Show-All group, a separator, then Quit —
/// the standard macOS application-menu shape.
#[test]
fn app_menu_is_about_settings_hide_group_then_quit_in_order() {
    let app_menu = MENU_SPEC.iter().find(|s| s.title == "App").unwrap();
    assert!(matches!(
        app_menu.items[0],
        Item::Action { id: "about", .. }
    ));
    assert!(matches!(app_menu.items[1], Item::Separator));
    assert!(matches!(
        app_menu.items[2],
        Item::Action {
            id: "open-settings",
            ..
        }
    ));
    assert!(matches!(app_menu.items[3], Item::Separator));
    assert!(matches!(
        app_menu.items[4],
        Item::Predefined(Predefined::Hide)
    ));
    assert!(matches!(
        app_menu.items[5],
        Item::Predefined(Predefined::HideOthers)
    ));
    assert!(matches!(
        app_menu.items[6],
        Item::Predefined(Predefined::ShowAll)
    ));
    assert!(matches!(app_menu.items[7], Item::Separator));
    assert!(matches!(app_menu.items[8], Item::Action { id: "quit", .. }));
    assert_eq!(
        app_menu.items.len(),
        9,
        "no items beyond the documented shape"
    );
}

/// Accelerators match the documented contract for the items that have one.
#[test]
fn accelerators_match_contract() {
    let want: &[(&str, &str)] = &[
        ("open-settings", "CmdOrCtrl+Comma"),
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

/// `about` deliberately has no accelerator — matching every native macOS
/// app menu, where About is never bound to a key combination.
#[test]
fn about_has_no_accelerator() {
    let found = MENU_SPEC
        .iter()
        .flat_map(|s| s.items.iter())
        .find_map(|i| match i {
            Item::Action {
                id: "about", accel, ..
            } => Some(*accel),
            _ => None,
        })
        .expect("about must be a real actionable item");
    assert_eq!(found, None);
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
