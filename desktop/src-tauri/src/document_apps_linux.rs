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
            })
        })
        .collect())
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
