//! Native window menu for CLIO Desktop (1.0 item 9).
//!
//! Builds the cross-platform application/window menu (a menubar on
//! Windows/Linux, the global app menu on macOS) and wires non-predefined
//! item activations to a single Tauri event the SolidJS frontend listens
//! for.
//!
//! ## Event contract (the JS side relies on this EXACTLY)
//!
//! When a non-predefined menu item is activated we emit, to all windows:
//!
//! - event name: `clio:menu`
//! - payload: `{ "action": "<action-id>" }`
//!
//! `<action-id>` is one of the strings in [`menu_action_table`]. Predefined
//! items (Quit + the whole Edit menu) carry native behavior and emit no
//! event. Fullscreen is handled natively in Rust (see [`handle_menu_event`])
//! AND mirrored as a `fullscreen` event so the frontend can keep its own UI
//! chrome in sync.
//!
//! The menu item ids are the same strings as the action-ids, so the
//! id → action mapping is the identity over the table; the table is the
//! single source of truth for "which ids are ours" and is asserted in tests.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// The Tauri event emitted to all windows when an actionable (non-predefined)
/// menu item is activated.
pub const MENU_EVENT: &str = "clio:menu";

/// Payload for [`MENU_EVENT`]. Serializes to `{ "action": "<action-id>" }`.
#[derive(Clone, serde::Serialize)]
pub struct MenuActionPayload {
    pub action: String,
}

/// The full set of actionable (non-predefined) menu items, as
/// `(menu_item_id, action_id)` pairs.
///
/// Item ids and action ids are intentionally identical, but keeping the
/// pair explicit (a) documents the contract in one place and (b) lets the
/// [`action_for_id`] mapping be table-driven and unit-tested without a live
/// menu. This is the authoritative list of action-ids in the event contract.
pub fn menu_action_table() -> &'static [(&'static str, &'static str)] {
    &[
        // File
        ("new-session", "new-session"),
        ("import-session", "import-session"),
        ("export-session", "export-session"),
        ("open-settings", "open-settings"),
        // View
        ("toggle-inspector", "toggle-inspector"),
        ("toggle-sessions", "toggle-sessions"),
        ("cycle-density", "cycle-density"),
        ("command-palette", "command-palette"),
        ("keyboard-shortcuts", "keyboard-shortcuts"),
        ("fullscreen", "fullscreen"),
        // Help
        ("help-docs", "help-docs"),
        ("about", "about"),
    ]
}

/// Map a menu item id to its action-id, or `None` for predefined items
/// (Quit, Undo/Redo/Cut/Copy/Paste/Select-All) and any unknown id.
pub fn action_for_id(id: &str) -> Option<&'static str> {
    menu_action_table()
        .iter()
        .find(|(item_id, _)| *item_id == id)
        .map(|(_, action)| *action)
}

/// Build the full native menu tree.
///
/// Top-level submenus: **File**, **Edit**, **View**, **Help**. Edit is made
/// entirely of [`PredefinedMenuItem`]s so the OS provides native clipboard /
/// undo behavior. Accelerators use the `CmdOrCtrl` modifier so they render as
/// Cmd on macOS and Ctrl elsewhere.
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // --- File ---------------------------------------------------------------
    let new_session = MenuItem::with_id(
        app,
        "new-session",
        "New Session",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let import_session =
        MenuItem::with_id(app, "import-session", "Import Session…", true, None::<&str>)?;
    let export_session = MenuItem::with_id(
        app,
        "export-session",
        "Export Session",
        true,
        Some("CmdOrCtrl+S"),
    )?;
    let settings = MenuItem::with_id(
        app,
        "open-settings",
        "Settings",
        true,
        Some("CmdOrCtrl+Comma"),
    )?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new_session,
            &import_session,
            &export_session,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    // --- Edit (all predefined for native clipboard behavior) ----------------
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    // --- View ---------------------------------------------------------------
    let toggle_inspector = MenuItem::with_id(
        app,
        "toggle-inspector",
        "Toggle Inspector",
        true,
        Some("CmdOrCtrl+I"),
    )?;
    let toggle_sessions = MenuItem::with_id(
        app,
        "toggle-sessions",
        "Toggle Sessions Column",
        true,
        Some("CmdOrCtrl+B"),
    )?;
    let cycle_density = MenuItem::with_id(
        app,
        "cycle-density",
        "Cycle Density",
        true,
        Some("Ctrl+O"),
    )?;
    let command_palette = MenuItem::with_id(
        app,
        "command-palette",
        "Command Palette",
        true,
        Some("CmdOrCtrl+K"),
    )?;
    let keyboard_shortcuts = MenuItem::with_id(
        app,
        "keyboard-shortcuts",
        "Keyboard Shortcuts",
        true,
        Some("CmdOrCtrl+/"),
    )?;
    let fullscreen =
        MenuItem::with_id(app, "fullscreen", "Fullscreen", true, Some("F11"))?;
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &toggle_inspector,
            &toggle_sessions,
            &cycle_density,
            &PredefinedMenuItem::separator(app)?,
            &command_palette,
            &keyboard_shortcuts,
            &PredefinedMenuItem::separator(app)?,
            &fullscreen,
        ],
    )?;

    // --- Help ---------------------------------------------------------------
    let help_docs =
        MenuItem::with_id(app, "help-docs", "Documentation", true, None::<&str>)?;
    let about =
        MenuItem::with_id(app, "about", "About CLIO Desktop", true, None::<&str>)?;
    let help = Submenu::with_items(app, "Help", true, &[&help_docs, &about])?;

    Menu::with_items(app, &[&file, &edit, &view, &help])
}

/// Handle a menu activation: emit the [`MENU_EVENT`] for actionable items and
/// toggle native fullscreen for the `fullscreen` action.
///
/// Predefined items (Quit + Edit) never reach an actionable branch here; the
/// OS performs their behavior and `action_for_id` returns `None`.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let Some(action) = action_for_id(id) else {
        return;
    };

    // Fullscreen is also actioned natively so it works even if the frontend
    // hasn't registered a listener yet; the event still fires so the web UI
    // can keep its chrome in sync.
    if action == "fullscreen" {
        if let Some(win) = app.get_webview_window("main") {
            let now = win.is_fullscreen().unwrap_or(false);
            let _ = win.set_fullscreen(!now);
        }
    }

    let _ = app.emit(
        MENU_EVENT,
        MenuActionPayload {
            action: action.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The id → action mapping must cover every actionable item and reject
    /// predefined / unknown ids.
    #[test]
    fn action_map_covers_every_actionable_item() {
        let expected = [
            "new-session",
            "import-session",
            "export-session",
            "open-settings",
            "toggle-inspector",
            "toggle-sessions",
            "cycle-density",
            "command-palette",
            "keyboard-shortcuts",
            "fullscreen",
            "help-docs",
            "about",
        ];

        // Every expected action-id resolves to itself.
        for id in expected {
            assert_eq!(
                action_for_id(id),
                Some(id),
                "actionable id {id:?} must map to its action-id"
            );
        }

        // The table contains exactly the expected set (no more, no fewer).
        let table_ids: Vec<&str> = menu_action_table().iter().map(|(id, _)| *id).collect();
        assert_eq!(
            table_ids.len(),
            expected.len(),
            "action table size drifted from the documented contract"
        );
        for (id, action) in menu_action_table() {
            assert!(
                expected.contains(id),
                "unexpected id {id:?} in the action table"
            );
            assert_eq!(id, action, "item id and action id must be identical for {id:?}");
        }
    }

    /// Predefined and unknown ids must not map to an action (they get native
    /// OS behavior or are ignored).
    #[test]
    fn predefined_and_unknown_ids_have_no_action() {
        for id in [
            "quit",
            "undo",
            "redo",
            "cut",
            "copy",
            "paste",
            "select-all",
            "show",        // tray item id from lib.rs
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

    /// The menu builds on a mock runtime and has the expected shape:
    /// four top-level submenus (File, Edit, View, Help) with the documented
    /// item counts (separators included).
    #[test]
    fn builds_four_submenus_with_expected_item_counts() {
        let app = tauri::test::mock_app();
        let menu = build_menu(app.handle()).expect("menu builds on mock runtime");

        let items = menu.items().expect("top-level items");
        assert_eq!(items.len(), 4, "expected File/Edit/View/Help");

        let titles: Vec<String> = items
            .iter()
            .map(|i| {
                i.as_submenu()
                    .expect("top-level entries are submenus")
                    .text()
                    .expect("submenu text")
            })
            .collect();
        assert_eq!(titles, vec!["File", "Edit", "View", "Help"]);

        // (submenu title, expected item count including separators)
        let expected_counts = [
            ("File", 7), // new, import, export, sep, settings, sep, quit
            ("Edit", 7), // undo, redo, sep, cut, copy, paste, select-all
            ("View", 8), // inspector, sessions, density, sep, palette, shortcuts, sep, fullscreen
            ("Help", 2), // docs, about
        ];
        for (idx, (title, count)) in expected_counts.iter().enumerate() {
            let sub = items[idx].as_submenu().expect("submenu");
            assert_eq!(&sub.text().unwrap(), title);
            assert_eq!(
                sub.items().expect("submenu items").len(),
                *count,
                "{title} submenu item count"
            );
        }
    }

    /// Every actionable item id from the table is present as a real menu item
    /// in the built tree (guards against the builder and table drifting apart).
    #[test]
    fn every_actionable_id_exists_in_built_menu() {
        let app = tauri::test::mock_app();
        let menu = build_menu(app.handle()).expect("menu builds");

        let mut found_ids: Vec<String> = Vec::new();
        for top in menu.items().expect("top items") {
            if let Some(sub) = top.as_submenu() {
                for item in sub.items().expect("sub items") {
                    found_ids.push(item.id().as_ref().to_string());
                }
            }
        }

        for (id, _) in menu_action_table() {
            assert!(
                found_ids.iter().any(|f| f == id),
                "actionable id {id:?} missing from the built menu (found: {found_ids:?})"
            );
        }
    }
}
