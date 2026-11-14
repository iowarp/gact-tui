//! Native strings in the interface language: the macOS menu bar, the tray menu
//! and tooltip, and the macOS "Move to Applications" prompt.
//!
//! The web interface owns every translation (its PO catalogs are the one place
//! translators work). Once it has activated a language it sends the native
//! strings through [`set_native_copy`], already translated, keyed as below and
//! with `{name}`, `{dest}` and `{error}` left as placeholders. This module keeps
//! that table, saves it beside the app's other settings so the next launch
//! builds its menus in the same language, and rebuilds the tray and menu bar.
//!
//! Every key has its English text here, used until the interface reports a
//! language and for any key a table lacks, so a missing translation never
//! leaves a menu item blank.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use tauri::{AppHandle, Manager, Runtime};

/// File in the app config directory that keeps the last table the interface sent.
const COPY_FILE: &str = "native-copy.json";

/// Keys the interface sends and their English text. `web/src/tauri/native-copy.ts`
/// produces the same keys; `native_copy_tests` checks the two stay in step.
pub(crate) const ENGLISH: &[(&str, &str)] = &[
    ("menu.File", "File"),
    ("menu.Edit", "Edit"),
    ("menu.View", "View"),
    ("menu.Agent", "Agent"),
    ("menu.Window", "Window"),
    ("menu.Help", "Help"),
    ("menu.Add an Agent", "Add an Agent"),
    ("menu.item.about", "About {name}"),
    ("menu.item.open-settings", "Settings…"),
    ("menu.item.quit", "Quit {name}"),
    ("menu.item.new-session", "New Conversation"),
    ("menu.item.search", "Search…"),
    ("menu.item.toggle-left-bar", "Toggle Left Bar"),
    ("menu.item.toggle-workbench", "Toggle Workbench"),
    ("menu.item.reload", "Reload"),
    ("menu.item.zoom-reset", "Actual Size"),
    ("menu.item.zoom-in", "Zoom In"),
    ("menu.item.zoom-out", "Zoom Out"),
    ("menu.item.connection-settings", "Connection Settings"),
    ("menu.item.switch-agent", "Switch To…"),
    ("menu.item.manage-agents", "Manage Agents"),
    ("menu.item.connect-by-address", "Connect by Address…"),
    ("menu.item.manage-agent-services", "Connect over SSH…"),
    ("menu.item.install-agent", "Install {name} on a Computer…"),
    ("menu.item.open-infrastructure", "Infrastructure"),
    ("menu.item.help-docs", "Documentation"),
    ("menu.item.keyboard-shortcuts", "Keyboard Shortcuts"),
    // Predefined items keep the operating system's text unless a translation is sent.
    ("menu.predefined.undo", "Undo"),
    ("menu.predefined.redo", "Redo"),
    ("menu.predefined.cut", "Cut"),
    ("menu.predefined.copy", "Copy"),
    ("menu.predefined.paste", "Paste"),
    ("menu.predefined.select_all", "Select All"),
    ("menu.predefined.hide", "Hide {name}"),
    ("menu.predefined.hide_others", "Hide Others"),
    ("menu.predefined.show_all", "Show All"),
    ("menu.predefined.minimize", "Minimize"),
    ("menu.predefined.maximize", "Zoom"),
    ("menu.predefined.fullscreen", "Enter Full Screen"),
    ("menu.predefined.close_window", "Close Window"),
    ("menu.predefined.bring_all_to_front", "Bring All to Front"),
    ("tray.show", "Show {name}"),
    ("tray.quit", "Quit {name}"),
    ("tray.tooltip", "{name}: running"),
    ("move.title", "Move {name} to Applications?"),
    (
        "move.message.disk_image",
        "{name} is running from its disk image, so it cannot update itself or keep its \
         place in the Dock.\n\nMove it to {dest} now? {name} will reopen from there.",
    ),
    (
        "move.message.translocated",
        "{name} is running from a temporary location macOS uses for downloaded apps, so \
         it cannot update itself or keep its place in the Dock.\n\nMove it to {dest} now? \
         {name} will reopen from there.",
    ),
    (
        "move.failed",
        "{name} could not be moved to {dest}: {error}\n\nQuit {name}, drag it into \
         Applications in Finder, then open it from there.",
    ),
    ("move.confirm", "Move to Applications"),
    ("move.later", "Not Now"),
];

static COPY: RwLock<BTreeMap<String, String>> = RwLock::new(BTreeMap::new());

pub(crate) fn english(key: &str) -> Option<&'static str> {
    ENGLISH
        .iter()
        .find(|(candidate, _)| *candidate == key)
        .map(|(_, text)| *text)
}

/// The interface's translation of `key`, when it sent one.
pub(crate) fn translated(key: &str) -> Option<String> {
    COPY.read()
        .ok()
        .and_then(|copy| copy.get(key).filter(|text| !text.trim().is_empty()).cloned())
}

/// `key` in the interface language, else English.
pub(crate) fn text(key: &str) -> String {
    translated(key)
        .or_else(|| english(key).map(str::to_owned))
        .unwrap_or_else(|| key.to_owned())
}

/// Fill `{placeholder}`s; a placeholder without a value is left as written.
pub(crate) fn fill(template: &str, values: &[(&str, &str)]) -> String {
    values.iter().fold(template.to_owned(), |text, (name, value)| {
        text.replace(&format!("{{{name}}}"), value)
    })
}

/// `key` in the interface language with its placeholders filled.
pub(crate) fn format(key: &str, values: &[(&str, &str)]) -> String {
    fill(&text(key), values)
}

/// Keep only known keys whose text keeps every placeholder its English text has,
/// so a damaged translation falls back to English instead of losing the app name.
pub(crate) fn accepted(copy: BTreeMap<String, String>) -> BTreeMap<String, String> {
    copy.into_iter()
        .filter(|(key, text)| {
            english(key).is_some_and(|source| {
                placeholders(source)
                    .iter()
                    .all(|placeholder| text.contains(placeholder.as_str()))
            })
        })
        .collect()
}

fn placeholders(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find('{') {
        let Some(len) = rest[start..].find('}') else {
            break;
        };
        found.push(rest[start..start + len + 1].to_owned());
        rest = &rest[start + len + 1..];
    }
    found
}

/// Replace the table; true when it changed.
pub(crate) fn replace(copy: BTreeMap<String, String>) -> bool {
    let Ok(mut current) = COPY.write() else {
        return false;
    };
    if *current == copy {
        return false;
    }
    *current = copy;
    true
}

fn copy_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(COPY_FILE))
}

fn read_table(path: &Path) -> Option<BTreeMap<String, String>> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Load the table the interface sent last time, so the menus open in its language.
pub(crate) fn load_saved<R: Runtime>(app: &AppHandle<R>) {
    if let Some(table) = copy_path(app).as_deref().and_then(read_table) {
        replace(accepted(table));
    }
}

fn save<R: Runtime>(app: &AppHandle<R>, copy: &BTreeMap<String, String>) {
    let Some(path) = copy_path(app) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    match serde_json::to_string_pretty(copy) {
        Ok(text) => {
            if let Err(error) = std::fs::write(&path, text) {
                crate::supervisor_boot_log::boot_log_line(&format!(
                    "native copy: could not save {}: {error}",
                    path.display()
                ));
            }
        }
        Err(error) => crate::supervisor_boot_log::boot_log_line(&format!(
            "native copy: could not encode the table: {error}"
        )),
    }
}

/// Native strings from the interface, in its active language. An empty table
/// means English. Rebuilds the tray and the macOS menu bar when the text changed.
/// `language` is the interface language the person picked, absent when it
/// follows the system; macOS uses it for its own menu text from the next launch.
#[tauri::command]
pub fn set_native_copy(
    app: tauri::AppHandle,
    copy: BTreeMap<String, String>,
    language: Option<String>,
) -> Result<(), String> {
    // Before the unchanged-table check: English and "follow the system" both
    // send an empty table.
    crate::app_language::follow_interface_language(language.as_deref());
    let copy = accepted(copy);
    if !replace(copy.clone()) {
        return Ok(());
    }
    save(&app, &copy);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = crate::tray::refresh_tray(&handle) {
            crate::supervisor_boot_log::boot_log_line(&format!(
                "native copy: tray not refreshed: {error}"
            ));
        }
        #[cfg(target_os = "macos")]
        if let Err(error) = crate::menu::install_menu(&handle) {
            crate::supervisor_boot_log::boot_log_line(&format!(
                "native copy: menu bar not refreshed: {error}"
            ));
        }
    })
    .map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "native_copy_tests.rs"]
mod tests;
