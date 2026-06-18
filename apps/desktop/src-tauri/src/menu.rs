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
//! `<action-id>` is one of the [`Item::Action`] ids in [`MENU_SPEC`].
//! Predefined items (Quit + the whole Edit menu) carry native behavior and
//! emit no event. Fullscreen is handled natively in Rust (see
//! [`handle_menu_event`]) AND mirrored as a `fullscreen` event so the
//! frontend can keep its own UI chrome in sync.
//!
//! ## Why a declarative spec
//!
//! The menu is defined once as [`MENU_SPEC`] — a pure-data tree — and
//! `build_menu` interprets it against the live Tauri runtime. This lets the
//! full structure (submenu titles, item counts, ids, accelerators, the
//! id→action map) be unit-tested with zero runtime dependency. Importantly,
//! that keeps `cargo test --lib` runnable on Windows: linking Tauri's `wry`
//! runtime (which `tauri::test::mock_app` requires) into a console test
//! binary fails to load here with STATUS_ENTRYPOINT_NOT_FOUND, which would
//! take down *every* test in the crate, not just this module's.

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

/// A single entry inside a submenu.
#[derive(Clone, Copy, Debug)]
pub enum Item {
    /// A normal, actionable item. `id` is BOTH the menu item id and the
    /// `action` string emitted on [`MENU_EVENT`]. `accel` is an optional
    /// Tauri accelerator string (`CmdOrCtrl+…` maps to Cmd on macOS / Ctrl
    /// elsewhere).
    Action {
        id: &'static str,
        label: &'static str,
        accel: Option<&'static str>,
    },
    /// A predefined OS item (native clipboard / quit behavior, no event).
    Predefined(Predefined),
    /// A visual separator.
    Separator,
}

/// The subset of Tauri [`PredefinedMenuItem`]s this menu uses.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Predefined {
    Quit,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
}

/// A top-level submenu (File / Edit / View / Help).
#[derive(Clone, Copy, Debug)]
pub struct SubmenuSpec {
    pub title: &'static str,
    pub items: &'static [Item],
}

/// User-facing native product name from the merged Tauri config.
///
/// Brand overlays update `productName`; native menus and tray labels should
/// derive from that same value instead of hardcoding the CLIO reference brand.
pub fn native_app_name<R: Runtime>(app: &AppHandle<R>) -> String {
    app.config()
        .product_name
        .clone()
        .unwrap_or_else(|| app.package_info().name.clone())
}

pub fn short_app_name(name: &str) -> &str {
    name.strip_suffix(" Desktop").unwrap_or(name)
}

fn about_label(name: &str) -> String {
    format!("About {name}")
}

/// The authoritative, data-only definition of the entire menu tree.
///
/// `build_menu` interprets this; the tests assert against it directly. Edit
/// this and both the runtime menu and the tests move together.
pub const MENU_SPEC: &[SubmenuSpec] = &[
    SubmenuSpec {
        title: "File",
        items: &[
            Item::Action {
                id: "new-session",
                label: "New Session",
                accel: Some("CmdOrCtrl+N"),
            },
            Item::Action {
                id: "import-session",
                label: "Import Session…",
                accel: None,
            },
            Item::Action {
                id: "export-session",
                label: "Export Session",
                accel: Some("CmdOrCtrl+S"),
            },
            Item::Separator,
            Item::Action {
                id: "open-settings",
                label: "Settings",
                accel: Some("CmdOrCtrl+Comma"),
            },
            Item::Separator,
            Item::Predefined(Predefined::Quit),
        ],
    },
    SubmenuSpec {
        // All predefined so the OS provides native clipboard / undo behavior.
        title: "Edit",
        items: &[
            Item::Predefined(Predefined::Undo),
            Item::Predefined(Predefined::Redo),
            Item::Separator,
            Item::Predefined(Predefined::Cut),
            Item::Predefined(Predefined::Copy),
            Item::Predefined(Predefined::Paste),
            Item::Predefined(Predefined::SelectAll),
        ],
    },
    SubmenuSpec {
        title: "View",
        items: &[
            Item::Action {
                id: "toggle-inspector",
                label: "Toggle Inspector",
                accel: Some("CmdOrCtrl+I"),
            },
            Item::Action {
                id: "toggle-sessions",
                label: "Toggle Sessions Column",
                accel: Some("CmdOrCtrl+Shift+B"),
            },
            Item::Action {
                id: "cycle-density",
                label: "Cycle Density",
                accel: Some("Ctrl+O"),
            },
            Item::Separator,
            Item::Action {
                id: "command-palette",
                label: "Command Palette",
                accel: Some("CmdOrCtrl+K"),
            },
            Item::Action {
                id: "keyboard-shortcuts",
                label: "Keyboard Shortcuts",
                accel: Some("CmdOrCtrl+/"),
            },
            Item::Separator,
            Item::Action {
                id: "fullscreen",
                label: "Fullscreen",
                accel: Some("F11"),
            },
        ],
    },
    SubmenuSpec {
        title: "Help",
        items: &[
            Item::Action {
                id: "help-docs",
                label: "Documentation",
                accel: None,
            },
            Item::Action {
                id: "about",
                label: "About",
                accel: None,
            },
        ],
    },
];

/// Map a menu item id to its action-id, or `None` for predefined items
/// (Quit, Undo/Redo/Cut/Copy/Paste/Select-All) and any unknown id.
///
/// Action ids are identical to their menu item ids, so this returns the
/// interned `&'static str` straight out of [`MENU_SPEC`] when `id` matches an
/// [`Item::Action`].
pub fn action_for_id(id: &str) -> Option<&'static str> {
    MENU_SPEC
        .iter()
        .flat_map(|s| s.items.iter())
        .find_map(|item| match item {
            Item::Action { id: aid, .. } if *aid == id => Some(*aid),
            _ => None,
        })
}

fn build_predefined<R: Runtime>(
    app: &AppHandle<R>,
    kind: Predefined,
) -> tauri::Result<PredefinedMenuItem<R>> {
    match kind {
        Predefined::Quit => PredefinedMenuItem::quit(app, Some("Quit")),
        Predefined::Undo => PredefinedMenuItem::undo(app, None),
        Predefined::Redo => PredefinedMenuItem::redo(app, None),
        Predefined::Cut => PredefinedMenuItem::cut(app, None),
        Predefined::Copy => PredefinedMenuItem::copy(app, None),
        Predefined::Paste => PredefinedMenuItem::paste(app, None),
        Predefined::SelectAll => PredefinedMenuItem::select_all(app, None),
    }
}

/// Build the full native menu tree from [`MENU_SPEC`].
///
/// Top-level submenus: **File**, **Edit**, **View**, **Help**. Edit is made
/// entirely of [`PredefinedMenuItem`]s so the OS provides native clipboard /
/// undo behavior. Accelerators use the `CmdOrCtrl` modifier so they render as
/// Cmd on macOS and Ctrl elsewhere.
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    for spec in MENU_SPEC {
        let submenu = Submenu::new(app, spec.title, true)?;
        for item in spec.items {
            match item {
                Item::Action { id, label, accel } => {
                    let label = if *id == "about" {
                        about_label(&native_app_name(app))
                    } else {
                        (*label).to_string()
                    };
                    let mi = MenuItem::with_id(app, *id, label, true, *accel)?;
                    submenu.append(&mi)?;
                }
                Item::Predefined(kind) => {
                    let pi = build_predefined(app, *kind)?;
                    submenu.append(&pi)?;
                }
                Item::Separator => {
                    submenu.append(&PredefinedMenuItem::separator(app)?)?;
                }
            }
        }
        menu.append(&submenu)?;
    }
    Ok(menu)
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

    /// The exact action-ids the JS side will switch on. If this list changes,
    /// the frontend contract changed — update both sides deliberately.
    const EXPECTED_ACTIONS: &[&str] = &[
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

    /// Table-driven: every actionable item id maps to its action-id and the
    /// set of action-ids is EXACTLY the documented contract (no drift).
    #[test]
    fn action_map_covers_every_actionable_item() {
        // Every documented action-id resolves to itself.
        for id in EXPECTED_ACTIONS {
            assert_eq!(
                action_for_id(id),
                Some(*id),
                "actionable id {id:?} must map to its action-id"
            );
        }

        // The spec's actionable ids are EXACTLY the documented set, same order.
        assert_eq!(
            all_action_ids(),
            EXPECTED_ACTIONS.to_vec(),
            "MENU_SPEC action ids drifted from the documented JS contract"
        );
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

    /// The spec has exactly four top-level submenus, in order, with the
    /// documented per-submenu item counts (separators + predefined included).
    /// `build_menu` interprets this spec 1:1, so asserting the spec asserts the
    /// built menu's shape without needing a Tauri runtime.
    #[test]
    fn spec_has_four_submenus_with_expected_item_counts() {
        let titles: Vec<&str> = MENU_SPEC.iter().map(|s| s.title).collect();
        assert_eq!(titles, vec!["File", "Edit", "View", "Help"]);

        // (title, total item count including separators + predefined)
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
    /// File. This guards the "use PredefinedMenuItem for OS clipboard
    /// behavior" requirement.
    #[test]
    fn edit_is_all_predefined_and_quit_is_predefined() {
        let edit = MENU_SPEC.iter().find(|s| s.title == "Edit").unwrap();
        assert!(
            edit.items
                .iter()
                .all(|i| matches!(i, Item::Predefined(_) | Item::Separator)),
            "every Edit item must be predefined (or a separator) — no Action items"
        );
        // ...and it must contain no Action items at all.
        assert!(
            !edit.items.iter().any(|i| matches!(i, Item::Action { .. })),
            "Edit must not contain any actionable (event-emitting) items"
        );

        let file = MENU_SPEC.iter().find(|s| s.title == "File").unwrap();
        assert!(
            file.items
                .iter()
                .any(|i| matches!(i, Item::Predefined(Predefined::Quit))),
            "File must contain the predefined Quit item"
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

    /// No duplicate action ids across the whole menu (ids double as event
    /// action strings, so collisions would be ambiguous).
    #[test]
    fn action_ids_are_unique() {
        let ids = all_action_ids();
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), ids.len(), "duplicate action id in MENU_SPEC");
    }

    #[test]
    fn native_brand_labels_derive_from_product_name() {
        assert_eq!(about_label("CLIO Desktop"), "About CLIO Desktop");
        assert_eq!(about_label("GACT Desktop"), "About GACT Desktop");
        assert_eq!(short_app_name("CLIO Desktop"), "CLIO");
        assert_eq!(short_app_name("GACT Desktop"), "GACT");
        assert_eq!(short_app_name("Other Product"), "Other Product");
    }
}
