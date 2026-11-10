//! System notifications for the attention notifier: the permission, banners
//! that open their conversation when clicked, and the Dock badge.
//!
//! macOS uses `UNUserNotificationCenter` directly. The notification plugin's
//! desktop path reports every permission as granted and posts through the
//! deprecated `NSUserNotificationCenter`, so a CLIO build never asked macOS for
//! permission, never appeared in System Settings > Notifications, and its
//! banners were not shown (#739). Windows and Linux keep the plugin, whose
//! toasts and D-Bus notifications need no permission request.

use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::blocking_command::off_main;

/// Emitted with the in-app path of the conversation a clicked banner names.
pub(crate) const OPEN_EVENT: &str = "clio:notification-open";

/// A click that arrived before the page listened (a banner that relaunched the
/// app), taken by the page once it starts.
static PENDING_OPEN: Mutex<Option<String>> = Mutex::new(None);

/// Whether this app may show banners, as the web `Notification.permission` names it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Permission {
    Granted,
    Denied,
    /// Not asked yet.
    Default,
    /// This build cannot post notifications (an unbundled development binary).
    Unsupported,
}

/// One banner the page asks for.
#[derive(Debug, Deserialize)]
pub(crate) struct Notice {
    /// Replaces an earlier banner with the same id (one per conversation and kind).
    id: String,
    title: String,
    #[serde(default)]
    body: Option<String>,
    /// The in-app route a click opens.
    path: String,
    /// Play the system's notification sound with it.
    #[serde(default)]
    sound: bool,
}

/// What became of a [`Notice`]: whether a banner was posted, and whether it
/// carries the system sound (the page plays its own chime when it does not).
#[derive(Debug, Default, Serialize)]
pub(crate) struct Shown {
    shown: bool,
    sound: bool,
}

#[derive(Clone, Serialize)]
struct OpenPayload {
    path: String,
}

/// Brings the window forward and hands `path` to the page.
fn open(app: &AppHandle, path: String) {
    // Only in-app routes: a banner never opens anything outside the app.
    if !path.starts_with('/') || path.starts_with("//") {
        return;
    }
    crate::tray::show_main_window(app);
    *PENDING_OPEN.lock().unwrap_or_else(PoisonError::into_inner) = Some(path.clone());
    let _ = app.emit(OPEN_EVENT, OpenPayload { path });
}

/// The request identifier of a notice: its id and the path a click opens, so a
/// click that relaunches the app still knows where to go.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn request_identifier(notice: &Notice) -> String {
    format!("{}|{}", notice.id, notice.path)
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn path_of(identifier: &str) -> Option<String> {
    identifier
        .split_once('|')
        .map(|(_, path)| path.to_owned())
        .filter(|path| !path.is_empty())
}

/// Installs the click handling. Called once from `setup`, before any banner.
pub(crate) fn install(app: &AppHandle) {
    platform::install(app);
}

#[tauri::command]
pub(crate) async fn notification_permission() -> Result<Permission, String> {
    off_main(|| Ok(platform::permission())).await
}

/// Asks the system once; later calls report the answer the person gave.
#[tauri::command]
pub(crate) async fn request_notification_permission() -> Result<Permission, String> {
    off_main(|| Ok(platform::request())).await
}

#[tauri::command]
pub(crate) async fn show_notification(app: AppHandle, notice: Notice) -> Result<Shown, String> {
    off_main(move || platform::show(&app, &notice)).await
}

/// The path of a banner clicked before the page listened, once.
#[tauri::command]
pub(crate) fn take_notification_open() -> Option<String> {
    PENDING_OPEN
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take()
}

/// The Dock (macOS) or launcher (Linux, where supported) count of
/// conversations waiting on the person; zero clears it. Windows has no count
/// badge, so it does nothing there.
#[tauri::command]
pub(crate) fn set_attention_badge(app: AppHandle, count: u32) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_badge_count((count > 0).then_some(i64::from(count)));
    }
}

/// Opens the system's notification settings for this app, where a denied
/// permission is changed. Returns false where there is no such page.
#[tauri::command]
pub(crate) fn open_notification_settings(app: AppHandle) -> bool {
    platform::open_settings(&app)
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ptr::NonNull;
    use std::sync::mpsc;
    use std::time::Duration;

    use block2::{DynBlock, RcBlock};
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{define_class, msg_send, AnyThread, DefinedClass};
    use objc2_foundation::{NSBundle, NSError, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent,
        UNNotification, UNNotificationPresentationOptions, UNNotificationRequest,
        UNNotificationResponse, UNNotificationSettings, UNNotificationSound,
        UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };
    use tauri::AppHandle;

    use super::{Notice, Permission, Shown};

    /// How long the settings read may take before the answer counts as unknown.
    const SETTINGS_TIMEOUT: Duration = Duration::from_secs(5);
    /// How long the permission prompt may stay open before the current state is reported.
    const PROMPT_TIMEOUT: Duration = Duration::from_secs(300);

    define_class!(
        // SAFETY: NSObject has no subclassing requirements and the delegate does not implement Drop.
        #[unsafe(super(NSObject))]
        #[name = "ClioNotificationDelegate"]
        #[ivars = AppHandle]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            // A banner posted while CLIO is the active app still shows: the
            // page posts one only while its window is in the background.
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn will_present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                completion_handler: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                completion_handler.call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::List
                    | UNNotificationPresentationOptions::Sound,));
            }

            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn did_receive(
                &self,
                _center: &UNUserNotificationCenter,
                response: &UNNotificationResponse,
                completion_handler: &DynBlock<dyn Fn()>,
            ) {
                let identifier = response.notification().request().identifier().to_string();
                if let Some(path) = super::path_of(&identifier) {
                    super::open(self.ivars(), path);
                }
                completion_handler.call(());
            }
        }
    );

    /// `UNUserNotificationCenter` raises an exception in a process without a
    /// bundle (a development binary), so it is only used inside an `.app`.
    fn center() -> Option<Retained<UNUserNotificationCenter>> {
        let bundle = NSBundle::mainBundle();
        let bundled = bundle.bundleIdentifier().is_some()
            && bundle.bundlePath().to_string().ends_with(".app");
        bundled.then(UNUserNotificationCenter::currentNotificationCenter)
    }

    pub(super) fn install(app: &AppHandle) {
        let Some(center) = center() else {
            return;
        };
        let delegate = Delegate::alloc().set_ivars(app.clone());
        let delegate: Retained<Delegate> = unsafe { msg_send![super(delegate), init] };
        center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        // The center holds its delegate weakly; this one lives as long as the app.
        std::mem::forget(delegate);
    }

    fn status(center: &UNUserNotificationCenter) -> Permission {
        let (sender, receiver) = mpsc::channel();
        let handler = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            // SAFETY: the system passes a valid settings object for the call.
            let status = unsafe { settings.as_ref() }.authorizationStatus();
            let _ = sender.send(status);
        });
        center.getNotificationSettingsWithCompletionHandler(&handler);
        match receiver.recv_timeout(SETTINGS_TIMEOUT) {
            Ok(status)
                if status == UNAuthorizationStatus::Authorized
                    || status == UNAuthorizationStatus::Provisional
                    || status == UNAuthorizationStatus::Ephemeral =>
            {
                Permission::Granted
            }
            Ok(status) if status == UNAuthorizationStatus::Denied => Permission::Denied,
            Ok(_) => Permission::Default,
            Err(_) => Permission::Unsupported,
        }
    }

    pub(super) fn permission() -> Permission {
        center().map_or(Permission::Unsupported, |center| status(&center))
    }

    pub(super) fn request() -> Permission {
        let Some(center) = center() else {
            return Permission::Unsupported;
        };
        let (sender, receiver) = mpsc::channel();
        let handler = RcBlock::new(move |_granted: Bool, _error: *mut NSError| {
            let _ = sender.send(());
        });
        center.requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert
                | UNAuthorizationOptions::Sound
                | UNAuthorizationOptions::Badge,
            &handler,
        );
        let _ = receiver.recv_timeout(PROMPT_TIMEOUT);
        status(&center)
    }

    pub(super) fn show(_app: &AppHandle, notice: &Notice) -> Result<Shown, String> {
        let Some(center) = center() else {
            return Ok(Shown::default());
        };
        if status(&center) != Permission::Granted {
            return Ok(Shown::default());
        }
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(&notice.title));
        if let Some(body) = notice.body.as_deref() {
            content.setBody(&NSString::from_str(body));
        }
        // The system sound follows Focus, Do Not Disturb and the app's own
        // "Play sound for notifications" setting.
        if notice.sound {
            content.setSound(Some(&UNNotificationSound::defaultSound()));
        }
        let identifier = NSString::from_str(&super::request_identifier(notice));
        let request =
            UNNotificationRequest::requestWithIdentifier_content_trigger(&identifier, &content, None);
        center.addNotificationRequest_withCompletionHandler(&request, None);
        Ok(Shown {
            shown: true,
            sound: notice.sound,
        })
    }

    pub(super) fn open_settings(_app: &AppHandle) -> bool {
        let Some(identifier) = NSBundle::mainBundle().bundleIdentifier() else {
            return false;
        };
        std::process::Command::new("/usr/bin/open")
            .arg(format!(
                "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id={identifier}"
            ))
            .spawn()
            .is_ok()
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicI32, Ordering};
    use std::sync::{Mutex, PoisonError};

    use tauri::AppHandle;
    use tauri_plugin_notification::NotificationExt;

    use super::{Notice, Permission, Shown};

    /// The paths of the most recent banners by plugin id, for their clicks.
    static PATHS: Mutex<VecDeque<(i32, String)>> = Mutex::new(VecDeque::new());
    const REMEMBERED: usize = 64;
    static NEXT_ID: AtomicI32 = AtomicI32::new(1);

    pub(super) fn install(app: &AppHandle) {
        let handle = app.clone();
        let _ = app.notification().on_action(move |performed| {
            let Some(id) = performed.notification().map(|notification| notification.id()) else {
                return;
            };
            let path = PATHS
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .iter()
                .find(|(shown, _)| *shown == id)
                .map(|(_, path)| path.clone());
            if let Some(path) = path {
                super::open(&handle, path);
            }
        });
    }

    // Windows and Linux ask nothing: the system's own settings turn an app's
    // notifications off.
    pub(super) fn permission() -> Permission {
        Permission::Granted
    }

    pub(super) fn request() -> Permission {
        Permission::Granted
    }

    pub(super) fn show(app: &AppHandle, notice: &Notice) -> Result<Shown, String> {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        {
            let mut paths = PATHS.lock().unwrap_or_else(PoisonError::into_inner);
            paths.push_back((id, notice.path.clone()));
            while paths.len() > REMEMBERED {
                paths.pop_front();
            }
        }
        let mut builder = app.notification().builder().id(id).title(&notice.title);
        if let Some(body) = notice.body.as_deref() {
            builder = builder.body(body);
        }
        // Windows plays the toast's sound under Focus assist's rules; Linux
        // servers treat a sound hint as optional, so the page chimes there.
        let sound = cfg!(windows) && notice.sound;
        if sound {
            builder = builder.sound("Default");
        }
        builder.show().map_err(|error| error.to_string())?;
        Ok(Shown { shown: true, sound })
    }

    pub(super) fn open_settings(_app: &AppHandle) -> bool {
        #[cfg(windows)]
        {
            std::process::Command::new("explorer.exe")
                .arg("ms-settings:notifications")
                .spawn()
                .is_ok()
        }
        #[cfg(not(windows))]
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notice(id: &str, path: &str) -> Notice {
        Notice {
            id: id.into(),
            title: "t".into(),
            body: None,
            path: path.into(),
            sound: false,
        }
    }

    #[test]
    fn a_request_identifier_carries_the_path_a_click_opens() {
        let path = "/workspaces/ws_default/sessions/sess_1";
        let identifier = request_identifier(&notice("clio-attention:sess_1", path));
        assert_eq!(path_of(&identifier).as_deref(), Some(path));
        assert_eq!(path_of("no-separator"), None);
    }

    #[test]
    fn a_pending_click_is_taken_once() {
        *PENDING_OPEN.lock().unwrap() = Some("/x".into());
        assert_eq!(take_notification_open().as_deref(), Some("/x"));
        assert_eq!(take_notification_open(), None);
    }
}
