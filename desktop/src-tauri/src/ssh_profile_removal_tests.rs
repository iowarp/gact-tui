//! Real filesystem acceptance for hiding versus forgetting SSH profiles.

use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

struct Fixture {
    root: PathBuf,
    paths: ProfilePaths,
}

impl Fixture {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = env::temp_dir().join(format!("clio-ssh-removal-{}-{nonce}", std::process::id()));
        fs::create_dir_all(root.join("identities")).unwrap();
        let paths = ProfilePaths {
            user_config: root.join("config"),
            managed_include: root.join("clio/config"),
            preferences: root.join("preferences.json"),
            identity_directory: root.join("identities"),
        };
        fs::write(
            &paths.user_config,
            "# Personal SSH configuration\r\nHost imported\r\n  HostName external.example.edu\r\n",
        )
        .unwrap();
        write_atomic(&paths.managed_include, "Host managed\n  HostName managed.example.edu\n\nHost other\n  HostName other.example.edu\n").unwrap();
        Self { root, paths }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let root = self.root.canonicalize().unwrap();
        assert!(root.starts_with(env::temp_dir().canonicalize().unwrap()));
        assert!(root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("clio-ssh-removal-"));
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn imported_removal_persists_without_editing_external_config_or_keys() {
    let fixture = Fixture::new();
    let paths = &fixture.paths;
    let before = fs::read(&paths.user_config).unwrap();
    let managed_before = fs::read(&paths.managed_include).unwrap();
    let personal_key = fixture.root.join("personal-key");
    let stored_key = paths.identity_directory.join("stored-key");
    fs::write(&personal_key, "personal test key").unwrap();
    fs::write(&stored_key, "stored test key").unwrap();
    let mut preferences = ProfilePreferences::default();
    preferences.hidden.insert("imported".into());
    preferences.metadata.insert(
        "imported".into(),
        ProfileMetadata {
            owned_identity: Some(stored_key.to_string_lossy().into_owned()),
            ..Default::default()
        },
    );
    write_preferences(&paths.preferences, &preferences).unwrap();

    remove_profile(paths, "IMPORTED").unwrap();
    remove_profile(paths, "imported").unwrap(); // A retried removal is idempotent.
    let restored = read_preferences(&paths.preferences).unwrap();
    assert!(restored.removed.contains("imported"));
    assert!(!restored.hidden.contains("imported"));
    assert!(!restored.metadata.contains_key("imported"));
    assert_eq!(fs::read(&paths.user_config).unwrap(), before);
    assert_eq!(fs::read(&paths.managed_include).unwrap(), managed_before);
    assert!(personal_key.exists() && stored_key.exists());
    assert!(resolve_all_profiles(paths, &restored)
        .unwrap()
        .iter()
        .all(|profile| profile.name != "imported"));
}

#[test]
fn managed_removal_deletes_only_its_block_and_unshared_owned_key() {
    let fixture = Fixture::new();
    let paths = &fixture.paths;
    // An external definition with the same alias must not reappear after removing the managed one.
    fs::write(
        &paths.user_config,
        "Host managed\n  HostName external.example.edu\n",
    )
    .unwrap();
    let external_before = fs::read(&paths.user_config).unwrap();
    let stored_key = paths.identity_directory.join("managed-key");
    fs::write(&stored_key, "test key").unwrap();
    let mut preferences = ProfilePreferences::default();
    preferences.metadata.insert(
        "managed".into(),
        ProfileMetadata {
            owned_identity: Some(stored_key.to_string_lossy().into_owned()),
            ..Default::default()
        },
    );
    preferences.hidden.insert("other".into());
    write_preferences(&paths.preferences, &preferences).unwrap();

    remove_profile(paths, "managed").unwrap();
    assert!(!stored_key.exists());
    assert_eq!(fs::read(&paths.user_config).unwrap(), external_before);
    let restored = read_preferences(&paths.preferences).unwrap();
    assert!(restored.hidden.contains("other"));
    assert_eq!(
        resolve_all_profiles(paths, &restored)
            .unwrap()
            .iter()
            .map(|profile| profile.name.as_str())
            .collect::<Vec<_>>(),
        vec!["other"]
    );
    assert!(fs::read_to_string(&paths.managed_include)
        .unwrap()
        .contains("Host other"));
}

#[test]
fn removing_one_managed_host_keeps_a_key_shared_with_another_host() {
    let fixture = Fixture::new();
    let paths = &fixture.paths;
    let key = paths.identity_directory.join("shared-key");
    fs::write(&key, "test shared key").unwrap();
    write_atomic(&paths.managed_include, &format!("Host managed\n  HostName first.example.edu\n  IdentityFile {}\n\nHost other\n  HostName other.example.edu\n  IdentityFile {}\n", quoted(&key.to_string_lossy()), quoted(&key.to_string_lossy()))).unwrap();
    let mut preferences = ProfilePreferences::default();
    preferences.metadata.insert(
        "managed".into(),
        ProfileMetadata {
            owned_identity: Some(key.to_string_lossy().into_owned()),
            ..Default::default()
        },
    );
    write_preferences(&paths.preferences, &preferences).unwrap();
    remove_profile(paths, "managed").unwrap();
    assert!(key.exists());
}

#[test]
fn saving_a_removed_managed_alias_restores_it() {
    let fixture = Fixture::new();
    let paths = &fixture.paths;
    remove_profile(paths, "managed").unwrap();
    let saved = save_profile(
        paths,
        SaveSshProfileRequest {
            name: "managed".into(),
            label: "Restored host".into(),
            hostname: "new.example.edu".into(),
            user: String::new(),
            port: 22,
            identity_file: String::new(),
            jump_hosts: vec![],
            platform: "auto".into(),
            install_root: String::new(),
            managed_identity: false,
            replace_existing: false,
        },
    )
    .unwrap();
    assert_eq!(saved.name, "managed");
    let restored = read_preferences(&paths.preferences).unwrap();
    assert!(!restored.removed.contains("managed"));
    assert!(!restored.hidden.contains("managed"));
    assert_eq!(
        managed_block(
            &read_managed_blocks(&paths.managed_include).unwrap(),
            "managed"
        )
        .map(declared_profile)
        .unwrap()
        .hostname
        .as_deref(),
        Some("new.example.edu")
    );
}

#[test]
fn unknown_or_invalid_alias_does_not_change_configuration() {
    let fixture = Fixture::new();
    let before = fs::read(&fixture.paths.managed_include).unwrap();
    assert!(remove_profile(&fixture.paths, "missing")
        .unwrap_err()
        .contains("not found"));
    assert!(remove_profile(&fixture.paths, "unsafe\nHost other").is_err());
    assert_eq!(fs::read(&fixture.paths.managed_include).unwrap(), before);
    assert!(!fixture.paths.preferences.exists());
}
