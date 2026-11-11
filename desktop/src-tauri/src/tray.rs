//! System-tray icon and its Show/Quit menu.
//!
//! Installs the platform tray, independent of the native window menu;
//! the future home for native session badges once the wire exposes them.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

use crate::menu;

pub(crate) const TRAY_ID: &str = "clio-tray";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";

/// The brand's monochrome menu-bar mark, copied by `gen-brand-backend` from
/// the brand's `trayTemplate`. Empty when the brand declares none.
const TRAY_TEMPLATE_PNG: &[u8] = include_bytes!("../gen/tray-template.png");

/// Which image the tray shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TrayIconSource {
    /// A template image: macOS draws only its alpha channel, in the menu-bar
    /// text color, so the mark follows light/dark menu bars and the selection
    /// highlight like system items do.
    Template,
    /// The full-color app icon (Windows/Linux trays, or a brand without a
    /// template).
    AppIcon,
}

pub(crate) fn tray_icon_source(is_macos: bool, template_png: &[u8]) -> TrayIconSource {
    if is_macos && !template_png.is_empty() {
        TrayIconSource::Template
    } else {
        TrayIconSource::AppIcon
    }
}

/// macOS opens a menu-bar item's menu on a left click; Windows and Linux
/// trays restore the window on a left click and keep the menu on the right.
pub(crate) fn left_click_opens_menu(is_macos: bool) -> bool {
    is_macos
}

/// The tray menu's two possible actions, decoupled from the Tauri menu-event
/// closure so the id→action mapping is unit-testable without a live
/// `AppHandle` (`tauri::test::mock_app` pulls in wry, which fails to link
/// into `cargo test --lib` on Windows here — see the module doc in
/// `menu.rs`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TrayAction {
    Show,
    Quit,
}

/// Map a tray menu item id to its action, or `None` for anything else.
pub(crate) fn tray_action_for(id: &str) -> Option<TrayAction> {
    match id {
        SHOW_ID => Some(TrayAction::Show),
        QUIT_ID => Some(TrayAction::Quit),
        _ => None,
    }
}

pub(crate) fn tray_show_label(product_name: &str) -> String {
    format!("Show {}", menu::short_app_name(product_name))
}

pub(crate) fn tray_quit_label(product_name: &str) -> String {
    format!("Quit {}", menu::short_app_name(product_name))
}

pub(crate) fn tray_tooltip_label(product_name: &str) -> String {
    format!("{}: running", menu::short_app_name(product_name))
}

/// Restore and focus the existing main window.
pub(crate) fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Install the platform tray icon and its small Show/Quit menu.
///
/// This remains independent of the native app/window menu. It is also the
/// future home for platform-native session badges once the live wire exposes
/// detached/background session counts.
pub(crate) fn install_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let product_name = menu::native_app_name(app.handle());
    let show = MenuItem::with_id(
        app,
        SHOW_ID,
        tray_show_label(&product_name),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        QUIT_ID,
        tray_quit_label(&product_name),
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let is_macos = cfg!(target_os = "macos");
    let mut tray = TrayIconBuilder::with_id(TRAY_ID);
    let template = match tray_icon_source(is_macos, TRAY_TEMPLATE_PNG) {
        TrayIconSource::Template => Image::from_bytes(TRAY_TEMPLATE_PNG).ok(),
        TrayIconSource::AppIcon => None,
    };
    if let Some(icon) = template {
        tray = tray.icon(icon).icon_as_template(true);
    } else if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    let menu_on_left_click = left_click_opens_menu(is_macos);
    tray.tooltip(tray_tooltip_label(&product_name))
        .menu(&menu)
        .show_menu_on_left_click(menu_on_left_click)
        .on_menu_event(|app, ev| match tray_action_for(ev.id().as_ref()) {
            Some(TrayAction::Show) => show_main_window(app),
            // The same user Quit as Cmd-Q (macOS confirms while a
            // conversation runs); it ends in the single guarded
            // `request_quit`, so it can never double-teardown.
            Some(TrayAction::Quit) => crate::request_user_quit(app),
            None => {}
        })
        .on_tray_icon_event(move |tray, event| {
            if !menu_on_left_click
                && matches!(
                    event,
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                )
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_show_label_uses_short_product_name() {
        assert_eq!(tray_show_label("CLIO Desktop"), "Show CLIO");
        assert_eq!(tray_show_label("GACT Desktop"), "Show GACT");
        assert_eq!(tray_show_label("Other Product"), "Show Other Product");
        assert_eq!(tray_quit_label("CLIO Desktop"), "Quit CLIO");
        assert_eq!(tray_quit_label("GACT Desktop"), "Quit GACT");
        assert_eq!(tray_quit_label("Other Product"), "Quit Other Product");
        assert_eq!(tray_tooltip_label("CLIO Desktop"), "CLIO: running");
    }

    /// The tray menu id→action mapping the `on_menu_event` closure dispatches
    /// on. This is what actually guarantees Quit routes through
    /// `crate::request_quit` rather than some inline double-teardown: the
    /// closure has exactly two match arms (`Show`, `Quit`) and no third way
    /// to reach `request_quit`, so once this mapping is right the closure's
    /// wiring — visible by inspection, four lines, and covered a second time
    /// by the `smoke.test.mjs` source check — cannot silently drift from it.
    #[test]
    fn macos_uses_the_brand_template_and_a_left_click_menu() {
        let png = [0x89, b'P', b'N', b'G'];
        assert_eq!(tray_icon_source(true, &png), TrayIconSource::Template);
        assert_eq!(tray_icon_source(true, &[]), TrayIconSource::AppIcon);
        assert_eq!(tray_icon_source(false, &png), TrayIconSource::AppIcon);
        assert!(left_click_opens_menu(true));
        assert!(!left_click_opens_menu(false));
    }

    /// The generated template must decode, or the macOS tray would silently
    /// fall back to the full-color app icon.
    #[test]
    fn generated_tray_template_is_empty_or_a_png() {
        if !TRAY_TEMPLATE_PNG.is_empty() {
            let image = Image::from_bytes(TRAY_TEMPLATE_PNG).expect("tray template decodes");
            assert!(image.width() >= 16 && image.width() == image.height());
        }
    }

    #[test]
    fn tray_action_for_maps_show_and_quit() {
        assert_eq!(tray_action_for(SHOW_ID), Some(TrayAction::Show));
        assert_eq!(tray_action_for(QUIT_ID), Some(TrayAction::Quit));
        assert_eq!(tray_action_for("bogus"), None);
        assert_eq!(tray_action_for(""), None);
    }
}
