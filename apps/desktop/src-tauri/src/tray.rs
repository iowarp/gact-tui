//! System-tray icon and its Show/Quit menu.
//!
//! Installs the platform tray, independent of the native window menu;
//! the future home for native session badges once the wire exposes them.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, Runtime};

use crate::menu;

pub(crate) const TRAY_ID: &str = "clio-tray";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";

pub(crate) fn tray_show_label(product_name: &str) -> String {
    format!("Show {}", menu::short_app_name(product_name))
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
    let quit = MenuItem::with_id(app, QUIT_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(product_name)
        .menu(&menu)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            SHOW_ID => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            QUIT_ID => {
                app.exit(0);
            }
            _ => {}
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
    }
}
