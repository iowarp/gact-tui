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
            // Routes through the single guarded quit path so this can never
            // double-teardown against the other entry points (native close
            // prompt, hamburger Quit, macOS menu Quit, quit_clio) that also
            // funnel through `request_quit`.
            QUIT_ID => crate::request_quit(app),
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

    /// Tray Quit must route through the single guarded quit path
    /// (`crate::request_quit`), never call `shutdown_owned_services`/
    /// `app.exit` directly — otherwise it can double-teardown against the
    /// other entry points (native close prompt, hamburger Quit, macOS menu
    /// Quit, `quit_clio`) that also funnel through `request_quit`.
    ///
    /// Exercising the real `on_menu_event` closure needs a live Tauri
    /// `AppHandle`; `tauri::test::mock_app` pulls in wry, which fails to
    /// link into `cargo test --lib` on Windows here with
    /// STATUS_ENTRYPOINT_NOT_FOUND for the WHOLE test binary (see the
    /// module doc in `menu.rs`) — so this asserts the wiring structurally
    /// against this file's own source, the same way
    /// `desktop/tests/smoke.test.mjs` checks `lib.rs`.
    #[test]
    fn quit_menu_item_routes_through_request_quit() {
        // Slice off everything from `#[cfg(test)]` onward first: this test's
        // own source text also contains the literal "QUIT_ID =>" (right
        // here), which would otherwise be the second match for `.split` and
        // shift `.nth(1)` onto the wrong segment.
        let source = include_str!("tray.rs");
        let production_source = source
            .split("#[cfg(test)]")
            .next()
            .expect("file must have a production section before #[cfg(test)]");
        let quit_arm = production_source
            .split("QUIT_ID =>")
            .nth(1)
            .expect("a QUIT_ID match arm must exist in on_menu_event");
        let arm_end = quit_arm.find(",\n").unwrap_or(quit_arm.len());
        let quit_arm_body = &quit_arm[..arm_end];
        assert!(
            quit_arm_body.contains("crate::request_quit"),
            "QUIT_ID must call crate::request_quit(app), got: {quit_arm_body:?}"
        );
        assert!(
            !quit_arm_body.contains("shutdown_owned_services") && !quit_arm_body.contains("app.exit"),
            "QUIT_ID must not call shutdown_owned_services/app.exit directly — \
             request_quit owns that sequencing, got: {quit_arm_body:?}"
        );
    }
}
