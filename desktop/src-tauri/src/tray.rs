//! System-tray icon and its Show/Quit menu.
//!
//! Installs the platform tray, independent of the native window menu;
//! the future home for native session badges once the wire exposes them.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

use crate::menu;

pub(crate) const TRAY_ID: &str = "clio-tray";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";

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
    let mut tray = TrayIconBuilder::with_id(TRAY_ID);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.tooltip(tray_tooltip_label(&product_name))
        .menu(&menu)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            SHOW_ID => show_main_window(app),
            QUIT_ID => {
                crate::shutdown_owned_services(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
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
}
