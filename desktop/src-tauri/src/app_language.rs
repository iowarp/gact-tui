//! The language macOS uses for the text it supplies itself: menu items AppKit
//! adds (Close All, AutoFill, Emoji & Symbols, Window > Fill), standard panels
//! and alerts.
//!
//! AppKit picks it at launch from the app's `AppleLanguages` default, else the
//! system languages, among the localizations the bundle declares
//! (`CFBundleLocalizations` in `Info.plist`). When the person picks an interface
//! language, the host writes it there so the next launch matches the interface.
//! When they go back to following the system, the host removes it again.
//!
//! macOS's own per-app language setting (System Settings > General > Language &
//! Region > Applications) writes the same default. The host records what it
//! wrote and removes the default only while it still holds that value, so it
//! never clears a choice the person made in System Settings.

/// Interface languages the bundle declares. `Info.plist` and the interface's
/// language list (`web/src/i18n/locales.ts`) list the same ones; the web tests
/// check all three agree.
pub(crate) const BUNDLE_LANGUAGES: [&str; 4] = ["en", "es", "ja", "el"];

/// What to do with the app's `AppleLanguages` default.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Change {
    /// Write this language and remember it was the host's choice.
    Set(String),
    /// Remove the default and the record: it still holds what the host wrote.
    Remove,
    /// Leave the default, which the person changed in System Settings, and drop the record.
    Forget,
    /// Nothing to do.
    Keep,
}

/// Decide the change. `chosen` is the language picked in the interface, `None`
/// when it follows the system. `current_is_written` says whether the default
/// still holds the value `written`, which the host wrote last time.
pub(crate) fn decide(
    chosen: Option<&str>,
    written: Option<&str>,
    current_is_written: bool,
) -> Change {
    match chosen {
        Some(language) if BUNDLE_LANGUAGES.contains(&language) => {
            if written == Some(language) && current_is_written {
                Change::Keep
            } else {
                Change::Set(language.to_owned())
            }
        }
        // A language the bundle does not declare: AppKit could not use it.
        Some(_) => Change::Keep,
        None => match written {
            Some(_) if current_is_written => Change::Remove,
            Some(_) => Change::Forget,
            None => Change::Keep,
        },
    }
}

/// Apply the interface's language choice to the app's `AppleLanguages`
/// default. AppKit reads it at launch, so it takes effect from the next one.
#[cfg(target_os = "macos")]
pub(crate) fn follow_interface_language(chosen: Option<&str>) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSArray, NSBundle, NSString, NSUserDefaults};

    const APPLE_LANGUAGES: &str = "AppleLanguages";
    /// The language the host last wrote to `AppleLanguages`.
    const WRITTEN: &str = "InterfaceLanguageWritten";

    // An unbundled development binary has no app domain of its own.
    let Some(bundle) = NSBundle::mainBundle().bundleIdentifier() else {
        return;
    };
    let defaults = NSUserDefaults::standardUserDefaults();
    let languages_key = NSString::from_str(APPLE_LANGUAGES);
    let written_key = NSString::from_str(WRITTEN);
    let written = defaults
        .stringForKey(&written_key)
        .map(|text| text.to_string());
    let expected = |language: &str| NSArray::from_retained_slice(&[NSString::from_str(language)]);
    // Read the app's own domain: `arrayForKey` would fall back to the system languages.
    let current_is_written = written.as_deref().is_some_and(|language| {
        defaults
            .persistentDomainForName(&bundle)
            .and_then(|domain| domain.objectForKey(&languages_key))
            .is_some_and(|current| {
                let expected = expected(language);
                // SAFETY: isEqual: takes any object and returns BOOL.
                unsafe { msg_send![&*current, isEqual: &*expected] }
            })
    });
    match decide(chosen, written.as_deref(), current_is_written) {
        Change::Set(language) => {
            let languages = expected(&language);
            let languages: &AnyObject = &languages;
            let language = NSString::from_str(&language);
            let language: &AnyObject = &language;
            // SAFETY: an NSArray of NSString and an NSString are property-list values.
            unsafe {
                defaults.setObject_forKey(Some(languages), &languages_key);
                defaults.setObject_forKey(Some(language), &written_key);
            }
        }
        Change::Remove => {
            defaults.removeObjectForKey(&languages_key);
            defaults.removeObjectForKey(&written_key);
        }
        Change::Forget => defaults.removeObjectForKey(&written_key),
        Change::Keep => {}
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn follow_interface_language(_chosen: Option<&str>) {}

#[cfg(test)]
mod tests {
    use super::{decide, Change};

    #[test]
    fn a_chosen_language_is_written_once() {
        assert_eq!(decide(Some("es"), None, false), Change::Set("es".into()));
        assert_eq!(decide(Some("es"), Some("es"), true), Change::Keep);
        assert_eq!(
            decide(Some("ja"), Some("es"), true),
            Change::Set("ja".into())
        );
    }

    #[test]
    fn a_chosen_language_replaces_a_system_settings_choice() {
        assert_eq!(
            decide(Some("es"), Some("es"), false),
            Change::Set("es".into())
        );
    }

    #[test]
    fn following_the_system_removes_only_what_the_host_wrote() {
        assert_eq!(decide(None, Some("es"), true), Change::Remove);
        assert_eq!(decide(None, Some("es"), false), Change::Forget);
        assert_eq!(decide(None, None, false), Change::Keep);
    }

    #[test]
    fn an_undeclared_language_changes_nothing() {
        assert_eq!(decide(Some("pseudo"), Some("es"), true), Change::Keep);
        assert_eq!(decide(Some("fr"), None, false), Change::Keep);
    }
}
