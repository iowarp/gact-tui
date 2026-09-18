//! Native macOS application menu for GACT Desktop (1.0 item 9).
//!
//! Builds ONLY the macOS global application menu (About / Settings / the
//! hide group / Quit) plus Edit, and wires its non-predefined item
//! activations to a single Tauri event the React frontend listens for.
//! Windows and Linux never call [`build_menu`] at all — see the
//! `#[cfg(target_os = "macos")]` gate in `lib.rs` — because those platforms
//! use the product-owned title bar exclusively (a second, OS-drawn menu
//! strip there would be a redundant, off-brand menu bar). Everything that
//! used to live in a native File/View/Help menu is reachable through that
//! same title bar's hamburger menu on every platform instead — see
//! `web/src/components/clio/desktop-title-bar.tsx`.
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
//! actionable but handled entirely natively — via `crate::request_quit` —
//! and never emitted to the JS bridge at all (see `handle_menu_event`).
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
    format!("About {name}")
}

fn quit_label(name: &str) -> String {
    format!("Quit {name}")
}

fn build_predefined<R: Runtime>(
    app: &AppHandle<R>,
    kind: Predefined,
) -> tauri::Result<PredefinedMenuItem<R>> {
    match kind {
        Predefined::Undo => PredefinedMenuItem::undo(app, None),
        Predefined::Redo => PredefinedMenuItem::redo(app, None),
        Predefined::Cut => PredefinedMenuItem::cut(app, None),
        Predefined::Copy => PredefinedMenuItem::copy(app, None),
        Predefined::Paste => PredefinedMenuItem::paste(app, None),
        Predefined::SelectAll => PredefinedMenuItem::select_all(app, None),
        Predefined::Hide => PredefinedMenuItem::hide(app, None),
        Predefined::HideOthers => PredefinedMenuItem::hide_others(app, None),
        Predefined::ShowAll => PredefinedMenuItem::show_all(app, None),
    }
}

/// Build the full native menu tree from [`MENU_SPEC`].
///
/// Top-level submenus: the macOS **application menu** (About / Settings /
/// the hide group / Quit) and **Edit**. Edit is made entirely of
/// [`PredefinedMenuItem`]s so the OS provides native clipboard / undo
/// behavior. Accelerators use the `CmdOrCtrl` modifier so they render as Cmd
/// on macOS (the only platform this menu is ever built on).
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    for spec in MENU_SPEC {
        let submenu = Submenu::new(app, spec.title, true)?;
        for item in spec.items {
            match item {
                Item::Action { id, label, accel } => {
                    let label = match *id {
                        "about" => about_label(&native_app_name(app)),
                        "quit" => quit_label(&native_app_name(app)),
                        _ => (*label).to_string(),
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

    // The macOS app-menu Quit (and its Cmd+Q accelerator) is one of the quit
    // entry points `crate::request_quit` guards against double teardown for.
    // It runs the same native hide+reap+exit as the tray Quit item, bypassing
    // the frontend close prompt entirely — matching prior native-Quit
    // behavior — so it must never fall through to the generic emit below.
    if action == "quit" {
        crate::request_quit(app);
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
        assert_eq!(short_app_name("CLIO Desktop"), "CLIO");
        assert_eq!(short_app_name("GACT Desktop"), "GACT");
        assert_eq!(short_app_name("Other Product"), "Other Product");
    }
}
