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
    /// A predefined OS item (native clipboard / quit behavior, no event).
    Predefined(Predefined),
    /// A visual separator.
    Separator,
}

/// The subset of Tauri predefined menu items this menu uses.
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

#[cfg(test)]
#[path = "menu_spec_tests.rs"]
mod tests;
