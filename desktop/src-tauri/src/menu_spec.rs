/// A single entry inside a submenu.
#[derive(Clone, Copy, Debug)]
pub enum Item {
    /// A normal, actionable item. `id` is BOTH the menu item id and the
    /// `action` string emitted on the desktop menu event. `accel` is an
    /// optional Tauri accelerator string (`CmdOrCtrl+...` maps to Cmd on macOS
    /// / Ctrl elsewhere).
    Action {
        id: &'static str,
        label: &'static str,
        accel: Option<&'static str>,
    },
    /// A predefined OS item (native clipboard/undo behavior, no event).
    Predefined(Predefined),
    /// A visual separator.
    Separator,
}

/// The subset of Tauri predefined menu items this menu uses.
///
/// Quit is deliberately NOT here: `PredefinedMenuItem::quit` runs the native
/// OS quit sequence directly, bypassing `request_quit`'s teardown guard (the
/// bug this menu used to have on macOS). Quit is a plain `Item::Action`
/// (id `"quit"`) below, handled natively in `handle_menu_event`.
///
/// `Hide` / `HideOthers` / `ShowAll` are the standard macOS "hide group" —
/// every native Cocoa app menu carries all three together, never just one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Predefined {
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Hide,
    HideOthers,
    ShowAll,
}

/// A top-level submenu (the macOS application menu / Edit).
#[derive(Clone, Copy, Debug)]
pub struct SubmenuSpec {
    pub title: &'static str,
    pub items: &'static [Item],
}

/// The authoritative, data-only definition of the entire menu tree.
///
/// `build_menu` interprets this; the tests assert against it directly. Edit
/// this and both the runtime menu and the tests move together.
///
/// This menu is macOS-only (see the `#[cfg(target_os = "macos")]` gate
/// around `app.set_menu` in `lib.rs`) and deliberately holds only the two
/// submenus macOS itself expects an app to own: the application menu (About
/// / Settings / the hide group / Quit) and Edit (native clipboard/undo).
/// Everything that used to live in File/View/Help is reachable through the
/// product-owned title bar's hamburger menu instead, on every platform —
/// see `web/src/components/clio/desktop-title-bar.tsx`.
pub const MENU_SPEC: &[SubmenuSpec] = &[
    SubmenuSpec {
        // macOS replaces this title with the running app's own display name
        // at render time regardless of what string is set here (standard
        // Cocoa application-menu behavior) — "App" only names the spec
        // entry for the tests below; it is never shown on screen.
        title: "App",
        items: &[
            // Dynamic label ("About <App>"), built in `build_menu`.
            Item::Action {
                id: "about",
                label: "About",
                accel: None,
            },
            Item::Separator,
            Item::Action {
                id: "open-settings",
                label: "Settings…",
                accel: Some("CmdOrCtrl+Comma"),
            },
            Item::Separator,
            Item::Predefined(Predefined::Hide),
            Item::Predefined(Predefined::HideOthers),
            Item::Predefined(Predefined::ShowAll),
            Item::Separator,
            // Native-only: handled in `handle_menu_event` by calling
            // `crate::request_quit` directly, never dispatched to the JS
            // `clio:menu` bridge (see `NATIVE_ONLY_ACTION_IDS` in the tests).
            // Dynamic label ("Quit <App>"), built in `build_menu`.
            Item::Action {
                id: "quit",
                label: "Quit",
                accel: Some("CmdOrCtrl+Q"),
            },
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
];

/// Map a menu item id to its action-id, or `None` for predefined items
/// (Undo/Redo/Cut/Copy/Paste/Select-All) and any unknown id.
///
/// Quit resolves to `Some("quit")` like any other [`Item::Action`] — it is
/// actionable, just handled entirely natively (never dispatched to the JS
/// bridge; see `handle_menu_event` in `menu.rs`).
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

#[cfg(test)]
#[path = "menu_spec_tests.rs"]
mod tests;
