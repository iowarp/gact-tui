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
    Minimize,
    /// Zoom on macOS.
    Maximize,
    Fullscreen,
    /// Cmd+W: the same close request as the window close button, so it opens
    /// the "keep running?" prompt rather than quitting.
    CloseWindow,
    BringAllToFront,
}

/// A top-level submenu (the macOS application menu, File, Edit, View, Agent,
/// Window, Help).
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
/// around `app.set_menu` in `lib.rs`). It is the full macOS menu bar: the
/// application menu, File, Edit, View, Agent, Window and Help. Every product
/// item is an [`Item::Action`] whose id the frontend handles through the
/// `clio:menu` event and `dispatchMenuAction`, so the native bar and the
/// product-owned title bar's app menu run the same workflows. Windows and
/// Linux get no native strip; their title-bar app menu
/// (`web/src/components/clio/desktop-title-bar.tsx`) uses the same grouping.
///
/// Accelerators repeat the shared shortcut catalog's macOS chords
/// (`web/src/lib/shortcuts/catalog.ts`). WKWebView offers a Cmd key to the
/// page first, so a key the page handles never also fires the menu item; the
/// accelerator runs the item when the page has no handler for it and shows
/// the key in the menu.
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
        title: "File",
        items: &[
            Item::Action {
                id: "new-session",
                label: "New Conversation",
                accel: Some("CmdOrCtrl+N"),
            },
            Item::Separator,
            // Cmd+W: the same close request as the window close button, so it
            // opens the "keep running?" prompt rather than quitting.
            Item::Predefined(Predefined::CloseWindow),
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
                id: "search",
                label: "Search…",
                accel: Some("CmdOrCtrl+K"),
            },
            Item::Separator,
            Item::Action {
                id: "toggle-left-bar",
                label: "Toggle Left Bar",
                accel: Some("CmdOrCtrl+B"),
            },
            Item::Action {
                id: "toggle-workbench",
                label: "Toggle Workbench",
                accel: Some("CmdOrCtrl+Shift+B"),
            },
            Item::Separator,
            Item::Action {
                id: "reload",
                label: "Reload",
                accel: Some("CmdOrCtrl+R"),
            },
            Item::Separator,
            Item::Action {
                id: "zoom-reset",
                label: "Actual Size",
                accel: Some("CmdOrCtrl+0"),
            },
            Item::Action {
                id: "zoom-in",
                label: "Zoom In",
                accel: Some("CmdOrCtrl+="),
            },
            Item::Action {
                id: "zoom-out",
                label: "Zoom Out",
                accel: Some("CmdOrCtrl+-"),
            },
            Item::Separator,
            // Ctrl+Cmd+F, and it keeps AppKit from adding a second one.
            Item::Predefined(Predefined::Fullscreen),
        ],
    },
    SubmenuSpec {
        // The CLIO menu's agent actions: the connection, the saved agents and
        // adding one. The agent list itself stays in the in-app CLIO menu.
        title: "Agent",
        items: &[
            Item::Action {
                id: "connection-settings",
                label: "Connection Settings",
                accel: None,
            },
            Item::Action {
                id: "manage-agents",
                label: "Manage Agents",
                accel: None,
            },
            Item::Separator,
            Item::Action {
                id: "connect-by-address",
                label: "Connect by Address…",
                accel: None,
            },
            Item::Action {
                id: "manage-agent-services",
                label: "Connect over SSH…",
                accel: None,
            },
            Item::Separator,
            Item::Action {
                id: "open-infrastructure",
                label: "Infrastructure",
                accel: Some("CmdOrCtrl+Shift+Comma"),
            },
        ],
    },
    SubmenuSpec {
        // Registered as the NSApp windows menu (`menu::register_app_roles`),
        // so macOS appends the open-window list.
        title: WINDOW_MENU_TITLE,
        items: &[
            Item::Predefined(Predefined::Minimize),
            Item::Predefined(Predefined::Maximize),
            Item::Separator,
            Item::Predefined(Predefined::BringAllToFront),
        ],
    },
    SubmenuSpec {
        // Registered as the NSApp help menu, so macOS adds menu search.
        title: HELP_MENU_TITLE,
        items: &[
            Item::Action {
                id: "help-docs",
                label: "Documentation",
                accel: None,
            },
            Item::Action {
                id: "keyboard-shortcuts",
                label: "Keyboard Shortcuts",
                accel: Some("CmdOrCtrl+/"),
            },
        ],
    },
];

pub const WINDOW_MENU_TITLE: &str = "Window";
pub const HELP_MENU_TITLE: &str = "Help";

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
