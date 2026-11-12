//! macOS text substitution in the web view.
//!
//! WebKit's smart dashes and smart quotes rewrite typed commands and code:
//! `--version` becomes `—version` and `"path"` gets curly quotes. HTML has no
//! attribute for either. WKWebView reads both choices from the app's own user
//! defaults before it falls back to the system setting, so CLIO registers them
//! off. These are registration defaults, the lowest-priority domain: a person
//! who turns Smart Dashes back on from the text Substitutions menu keeps that
//! choice. Spelling, autocorrection and text replacements are left to the
//! system setting.

use objc2::runtime::AnyObject;
use objc2_foundation::{NSDictionary, NSNumber, NSString, NSUserDefaults};

/// The WebKit user-defaults keys turned off by default.
const SUBSTITUTIONS_OFF: [&str; 2] = [
    "WebAutomaticDashSubstitutionEnabled",
    "WebAutomaticQuoteSubstitutionEnabled",
];

/// Registers the defaults. Call before the first web view is created: WebKit
/// reads them once per process.
pub(crate) fn register_text_substitution_defaults() {
    let off = NSNumber::new_bool(false);
    let off: &AnyObject = &off;
    let keys: Vec<_> = SUBSTITUTIONS_OFF
        .iter()
        .map(|key| NSString::from_str(key))
        .collect();
    let keys: Vec<&NSString> = keys.iter().map(|key| &**key).collect();
    let values = vec![off; keys.len()];
    let defaults = NSDictionary::<NSString, AnyObject>::from_slices(&keys, &values);
    // SAFETY: every key is an NSString and every value an NSNumber, both
    // property-list types as registerDefaults requires.
    unsafe { NSUserDefaults::standardUserDefaults().registerDefaults(&defaults) };
}
