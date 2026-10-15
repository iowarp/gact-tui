//! Public release tags and Python package versions use different beta spellings.

/// Resolve a release tag to the exact version published in Python metadata.
pub(crate) fn python_package_version(target: &str) -> Result<String, String> {
    let target = target.trim().trim_start_matches('v');
    let numeric = |value: &str| !value.is_empty() && value.bytes().all(|c| c.is_ascii_digit());
    if let Some((release, beta)) = target.split_once("-beta.") {
        if release.split('.').count() != 3 || !release.split('.').all(numeric) {
            return Err("The requested CLIO version is invalid.".into());
        }
        let parts: Vec<_> = beta.split('.').collect();
        return match parts.as_slice() {
            [number] if numeric(number) => Ok(format!("{release}b{number}")),
            [number, post] if numeric(number) && numeric(post) => {
                Ok(format!("{release}b{number}.post{post}"))
            }
            _ => Err("The requested CLIO beta version is invalid.".into()),
        };
    }
    let normalized = target.replace('+', ".");
    if (3..=4).contains(&normalized.split('.').count()) && normalized.split('.').all(numeric) {
        return Ok(normalized);
    }
    Err("The requested CLIO version is invalid.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_tags_resolve_to_the_published_python_version() {
        for (tag, expected) in [
            ("v0.9.5-beta.7", "0.9.5b7"),
            ("v0.9.5-beta.7.1", "0.9.5b7.post1"),
            ("v0.9.5-beta.5.2", "0.9.5b5.post2"),
            ("v0.9.4.24", "0.9.4.24"),
            ("0.9.4+24", "0.9.4.24"),
            ("v0.9.5", "0.9.5"),
        ] {
            assert_eq!(python_package_version(tag).unwrap(), expected);
        }
    }

    #[test]
    fn rejects_malformed_versions_and_command_or_python_injection() {
        for invalid in [
            "",
            "v",
            "0.9.5-beta.",
            "0.9.5-beta.7.1.2",
            "0.9.5-beta.x",
            "0.9.5';exit()",
            "0.9.5\n--index-url=other",
        ] {
            assert!(python_package_version(invalid).is_err(), "{invalid}");
        }
    }
}
