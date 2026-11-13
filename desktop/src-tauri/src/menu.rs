//! Native macOS application menu for GACT Desktop (1.0 item 9).
//!
//! Builds the macOS menu bar: the app menu (About / Settings / the hide group
//! / Quit), File, Edit, View, Agent, Window and Help. Every non-predefined
//! item emits a single Tauri event the React frontend dispatches through
//! `dispatchMenuAction`, so the bar runs the same workflows as the in-app
//! controls.
//! Windows and Linux never call [`build_menu`] at all — see the
//! `#[cfg(target_os = "macos")]` gate in `lib.rs` — because those platforms
//! use the product-owned title bar exclusively (a second, OS-drawn menu
//! strip there would be a redundant, off-brand menu bar). That title bar's
//! app menu (`web/src/components/clio/desktop-title-bar.tsx`) uses the same
//! File / View / Agent / Window / Help grouping.
//!
//! ## Event contract (the JS side relies on this EXACTLY)
//!
//! When a non-predefined menu item is activated we emit, to all windows:
//!
//! - event name: `clio:menu`
//! - payload: `{ "action": "<action-id>" }`
//!
//! `<action-id>` is one of the [`crate::menu_spec::Item::Action`] ids in
//! [`crate::menu_spec::MENU_SPEC`]. Predefined items (Edit, and the app
//! menu's hide group) carry native OS behavior and emit no event. Quit is
//! actionable but handled natively — via `crate::request_user_quit` — and
//! never emitted as a menu action (see `handle_menu_event`).
//!
//! ## Why a declarative spec
//!
//! The menu is defined once as [`crate::menu_spec::MENU_SPEC`] — a pure-data tree — and
//! `build_menu` interprets it against the live Tauri runtime. This lets the
//! full structure (submenu titles, item counts, ids, accelerators, the
//! id→action map) be unit-tested with zero runtime dependency. Importantly,
//! that keeps `cargo test --lib` runnable on Windows: linking Tauri's `wry`
//! runtime (which `tauri::test::mock_app` requires) into a console test
//! binary fails to load here with STATUS_ENTRYPOINT_NOT_FOUND, which would
//! take down *every* test in the crate, not just this module's.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

use crate::menu_spec::{action_for_id, Item, Predefined, MENU_SPEC};
use crate::native_copy;

/// The Tauri event emitted to all windows when an actionable (non-predefined)
/// menu item is activated.
pub const MENU_EVENT: &str = "clio:menu";

/// Payload for [`MENU_EVENT`]. Serializes to `{ "action": "<action-id>" }`.
#[derive(Clone, serde::Serialize)]
pub struct MenuActionPayload {
    pub action: String,
}

/// User-facing native product name from the merged Tauri config.
///
/// Brand overlays update `productName`; native menus and tray labels should
/// derive from that same value instead of hardcoding the CLIO reference brand.
pub fn native_app_name<R: Runtime>(app: &AppHandle<R>) -> String {
    crate::brand_backend::product_name()
        .map(str::to_owned)
        .or_else(|| app.config().product_name.clone())
        .unwrap_or_else(|| app.package_info().name.clone())
}

pub fn short_app_name(name: &str) -> &str {
    name.strip_suffix(" Desktop").unwrap_or(name)
}

fn about_label(name: &str) -> String {
    native_copy::format("menu.item.about", &[("name", name)])
}

fn quit_label(name: &str) -> String {
    native_copy::format("menu.item.quit", &[("name", name)])
}

fn install_agent_label(name: &str) -> String {
    native_copy::format("menu.item.install-agent", &[("name", short_app_name(name))])
}

/// The key of a predefined item's text in [`native_copy`].
fn predefined_key(kind: Predefined) -> &'static str {
    match kind {
        Predefined::Undo => "menu.predefined.undo",
        Predefined::Redo => "menu.predefined.redo",
        Predefined::Cut => "menu.predefined.cut",
        Predefined::Copy => "menu.predefined.copy",
        Predefined::Paste => "menu.predefined.paste",
        Predefined::SelectAll => "menu.predefined.select_all",
        Predefined::Hide => "menu.predefined.hide",
        Predefined::HideOthers => "menu.predefined.hide_others",
        Predefined::ShowAll => "menu.predefined.show_all",
        Predefined::Minimize => "menu.predefined.minimize",
        Predefined::Maximize => "menu.predefined.maximize",
        Predefined::Fullscreen => "menu.predefined.fullscreen",
        Predefined::CloseWindow => "menu.predefined.close_window",
        Predefined::BringAllToFront => "menu.predefined.bring_all_to_front",
    }
}

fn build_predefined<R: Runtime>(
    app: &AppHandle<R>,
    kind: Predefined,
) -> tauri::Result<PredefinedMenuItem<R>> {
    // The operating system's own text, unless the interface sent a translation.
    // The menu library's own English for full screen is "Toggle Full Screen",
    // not macOS's "Enter Full Screen", so that item always takes the table text.
    let key = predefined_key(kind);
    let text = match kind {
        Predefined::Fullscreen => Some(native_copy::text(key)),
        _ => native_copy::translated(key),
    }
    .map(|text| native_copy::fill(&text, &[("name", &native_app_name(app))]));
    let text = text.as_deref();
    match kind {
        Predefined::Undo => PredefinedMenuItem::undo(app, text),
        Predefined::Redo => PredefinedMenuItem::redo(app, text),
        Predefined::Cut => PredefinedMenuItem::cut(app, text),
        Predefined::Copy => PredefinedMenuItem::copy(app, text),
        Predefined::Paste => PredefinedMenuItem::paste(app, text),
        Predefined::SelectAll => PredefinedMenuItem::select_all(app, text),
        Predefined::Hide => PredefinedMenuItem::hide(app, text),
        Predefined::HideOthers => PredefinedMenuItem::hide_others(app, text),
        Predefined::ShowAll => PredefinedMenuItem::show_all(app, text),
        Predefined::Minimize => PredefinedMenuItem::minimize(app, text),
        Predefined::Maximize => PredefinedMenuItem::maximize(app, text),
        Predefined::Fullscreen => PredefinedMenuItem::fullscreen(app, text),
        Predefined::CloseWindow => PredefinedMenuItem::close_window(app, text),
        Predefined::BringAllToFront => PredefinedMenuItem::bring_all_to_front(app, text),
    }
}

/// A submenu title in the interface language. The application menu's title is
/// replaced by macOS with the app's name and keeps its spec name.
fn submenu_title(title: &str) -> String {
    native_copy::translated(&format!("menu.{title}")).unwrap_or_else(|| title.to_owned())
}

/// Build the full native menu tree from [`MENU_SPEC`].
///
/// Top-level submenus: the macOS **application menu** (About / Settings /
/// the hide group / Quit), **File**, **Edit**, **View**, **Agent**, **Window**
/// and **Help**. Edit is made entirely of
/// [`PredefinedMenuItem`]s so the OS provides native clipboard / undo
/// behavior. Accelerators use the `CmdOrCtrl` modifier so they render as Cmd
/// on macOS (the only platform this menu is ever built on).
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    for spec in MENU_SPEC {
        let submenu = Submenu::new(app, submenu_title(spec.title), true)?;
        append_items(app, &submenu, spec.items)?;
        menu.append(&submenu)?;
    }
    Ok(menu)
}

fn append_items<R: Runtime>(
    app: &AppHandle<R>,
    submenu: &Submenu<R>,
    items: &'static [Item],
) -> tauri::Result<()> {
    for item in items {
        match item {
            Item::Action { id, label, accel } => {
                let label = match *id {
                    "about" => about_label(&native_app_name(app)),
                    "quit" => quit_label(&native_app_name(app)),
                    "install-agent" => install_agent_label(&native_app_name(app)),
                    _ => native_copy::translated(&format!("menu.item.{id}"))
                        .unwrap_or_else(|| (*label).to_string()),
                };
                let mi = MenuItem::with_id(app, *id, label, true, *accel)?;
                submenu.append(&mi)?;
            }
            Item::Predefined(kind) => {
                let pi = build_predefined(app, *kind)?;
                submenu.append(&pi)?;
            }
            Item::Submenu { title, items } => {
                let nested = Submenu::new(app, submenu_title(title), true)?;
                append_items(app, &nested, items)?;
                submenu.append(&nested)?;
            }
            Item::Separator => {
                submenu.append(&PredefinedMenuItem::separator(app)?)?;
            }
        }
    }
    Ok(())
}

/// Hand the Window and Help submenus to AppKit once the menu is installed, so
/// macOS adds the open-window list and the Help search field to them.
#[cfg(target_os = "macos")]
pub fn register_app_roles<R: Runtime>(menu: &Menu<R>) -> tauri::Result<()> {
    use crate::menu_spec::{HELP_MENU_TITLE, WINDOW_MENU_TITLE};
    for item in menu.items()? {
        let Some(submenu) = item.as_submenu() else {
            continue;
        };
        // Titles are in the interface language, so compare with the same text.
        let text = submenu.text()?;
        if text == submenu_title(WINDOW_MENU_TITLE) {
            submenu.set_as_windows_menu_for_nsapp()?;
        } else if text == submenu_title(HELP_MENU_TITLE) {
            submenu.set_as_help_menu_for_nsapp()?;
        }
    }
    Ok(())
}

/// Build the menu bar in the current interface language and install it.
#[cfg(target_os = "macos")]
pub fn install_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let app_menu = build_menu(app)?;
    app.set_menu(app_menu.clone())?;
    register_app_roles(&app_menu)
}

/// Handle a menu activation: emit the [`MENU_EVENT`] for actionable items.
///
/// Predefined items (Edit, and the app menu's hide group) never reach an
/// actionable branch here; the OS performs their behavior and
/// `action_for_id` returns `None`. Quit is actionable but handled entirely
/// natively (see below) and never emitted to the JS bridge — there is
/// nothing for the frontend to do once teardown has started.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let Some(action) = action_for_id(id) else {
        return;
    };

    // The macOS app-menu Quit (and its Cmd+Q accelerator) quits through
    // `crate::request_user_quit`: the frontend confirms only while a
    // conversation is still running, then the guarded `crate::request_quit`
    // reaps the owned process tree. It must never fall through to the
    // generic emit below.
    if action == "quit" {
        crate::request_user_quit(app);
        return;
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

    #[test]
    fn native_brand_labels_derive_from_product_name() {
        assert_eq!(about_label("CLIO Desktop"), "About CLIO Desktop");
        assert_eq!(about_label("GACT Desktop"), "About GACT Desktop");
        assert_eq!(quit_label("CLIO Desktop"), "Quit CLIO Desktop");
        assert_eq!(quit_label("GACT Desktop"), "Quit GACT Desktop");
        assert_eq!(
            install_agent_label("CLIO Desktop"),
            "Install CLIO on a Computer…"
        );
        assert_eq!(
            install_agent_label("GACT Desktop"),
            "Install GACT on a Computer…"
        );
        assert_eq!(short_app_name("CLIO Desktop"), "CLIO");
        assert_eq!(short_app_name("GACT Desktop"), "GACT");
        assert_eq!(short_app_name("Other Product"), "Other Product");
    }
}
