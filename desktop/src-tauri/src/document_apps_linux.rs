//! GIO uses desktop MIME associations and launches desktop entries without a shell.
use super::DocumentApplication;
use gio::{prelude::*, AppInfo};
use std::path::Path;
fn content_type(extension: &str, mime_type: &str) -> String {
    let filename = format!("file.{extension}");
    let (guessed, uncertain) = gio::content_type_guess(Some(Path::new(&filename)), &[]);
    if uncertain && !mime_type.is_empty() && mime_type != "application/octet-stream" {
        gio::content_type_from_mime_type(mime_type)
            .unwrap_or(guessed)
            .to_string()
    } else {
        guessed.to_string()
    }
}
pub(super) fn discover(
    extension: &str,
    mime_type: &str,
) -> Result<Vec<DocumentApplication>, String> {
    let kind = content_type(extension, mime_type);
    let default = AppInfo::default_for_type(&kind, false).and_then(|app| app.id());
    Ok(AppInfo::all_for_type(&kind)
        .into_iter()
        .filter(|app| app.should_show())
        .filter_map(|app| {
            app.id().map(|id| DocumentApplication {
                is_default: default.as_ref() == Some(&id),
                id: id.to_string(),
                name: app.display_name().to_string(),
                icon_data_url: None,
            })
        })
        .collect())
}

/// Resolve the active desktop theme on GTK's thread, then encode images off that thread.
pub(super) async fn attach_icons(
    app: tauri::AppHandle,
    mut applications: Vec<DocumentApplication>,
) -> Vec<DocumentApplication> {
    use gtk::prelude::*;
    let ids: Vec<_> = applications.iter().map(|app| app.id.clone()).collect();
    let (sender, receiver) = std::sync::mpsc::channel();
    if app
        .run_on_main_thread(move || {
            let theme = gtk::IconTheme::default();
            let paths: Vec<_> = ids
                .iter()
                .map(|id| {
                    let icon = gio::DesktopAppInfo::new(id)?.icon()?;
                    theme
                        .as_ref()?
                        .lookup_by_gicon(&icon, 32, gtk::IconLookupFlags::FORCE_SIZE)?
                        .filename()
                })
                .collect();
            let _ = sender.send(paths);
        })
        .is_err()
    {
        return applications;
    }
    let icons = crate::blocking_command::off_main(move || {
        let paths = receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| format!("Read desktop icon theme: {error}"))?;
        Ok(paths
            .into_iter()
            .map(|path| {
                let pixbuf = gdk_pixbuf::Pixbuf::from_file_at_scale(path?, 32, 32, true).ok()?;
                super::png_data_url(&pixbuf.save_to_bufferv("png", &[]).ok()?)
            })
            .collect::<Vec<_>>())
    })
    .await
    .unwrap_or_default();
    for (application, icon) in applications.iter_mut().zip(icons) {
        application.icon_data_url = icon;
    }
    applications
}
pub(super) fn open_in(id: &str, path: &Path, extension: &str) -> Result<(), String> {
    let file = gio::File::for_path(path);
    let kind = file
        .query_info(
            "standard::content-type",
            gio::FileQueryInfoFlags::NONE,
            None::<&gio::Cancellable>,
        )
        .ok()
        .and_then(|info| info.content_type())
        .map(|kind| kind.to_string())
        .unwrap_or_else(|| content_type(extension, ""));
    let app = AppInfo::all_for_type(&kind)
        .into_iter()
        .find(|app| app.should_show() && app.id().as_deref() == Some(id))
        .ok_or("This app is no longer associated with this file type.")?;
    app.launch(&[file], None::<&gio::AppLaunchContext>)
        .map_err(|error| format!("Open the selected app: {error}"))
}
