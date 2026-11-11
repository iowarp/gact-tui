//! Operating-system credential storage for saved agent connections.
//!
//! Every command goes through the per-process [`SlotCache`], so each keychain item is
//! read from the OS at most once per launch and a denied read is never retried in a loop.

use crate::credential_cache::{CachedSlots, SlotCache};
use crate::credential_chunks::{self, SecretSlots};
use keyring::{Entry, Error};
use std::fs;
use tauri::{AppHandle, Manager};

const CREDENTIAL_SERVICE: &str = "ai.iowarp.gact.desktop.connection";
const PROVIDER_CREDENTIAL_SERVICE: &str = "ai.iowarp.gact.desktop.provider";

/// One OS keyring service, exposed as named slots so long secrets can be chunked.
struct KeyringSlots(&'static str);

impl SecretSlots for KeyringSlots {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(self.0, account).map_err(credential_error)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(read_error(error)),
        }
    }

    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        Entry::new(self.0, account)
            .map_err(credential_error)?
            .set_password(secret)
            .map_err(credential_error)
    }

    fn remove(&self, account: &str) -> Result<(), String> {
        match Entry::new(self.0, account)
            .map_err(credential_error)?
            .delete_credential()
        {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(credential_error(error)),
        }
    }
}

fn credential_account(endpoint: &str) -> Result<&str, String> {
    let account = endpoint.trim();
    if account.is_empty() {
        return Err("A connection address is required for secure credential storage.".to_string());
    }
    Ok(account)
}

fn credential_error(error: Error) -> String {
    format!("Secure credential storage is unavailable: {error}")
}

#[cfg(target_os = "macos")]
const CREDENTIAL_STORE_NAME: &str = "the macOS keychain";
#[cfg(target_os = "windows")]
const CREDENTIAL_STORE_NAME: &str = "Windows Credential Manager";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const CREDENTIAL_STORE_NAME: &str = "the system keyring";

/// A failed or denied read is remembered for this launch, so say how to recover.
fn read_error(error: Error) -> String {
    format!(
        "Couldn't read the saved credential from {CREDENTIAL_STORE_NAME} ({error}). \
         It won't be requested again until you enter it again or restart."
    )
}

/// The cached view of one credential service; the only way commands reach the OS store.
fn cached_slots(service: &'static str) -> CachedSlots<'static, KeyringSlots> {
    CachedSlots::new(service, KeyringSlots(service), SlotCache::process())
}

/// An explicit user store or delete may ask the OS again after a remembered failure.
fn cached_slots_for_write(
    service: &'static str,
    account: &str,
) -> CachedSlots<'static, KeyringSlots> {
    SlotCache::process().forget_failures(service, account);
    cached_slots(service)
}

fn provider_credential_account(provider_id: &str, api_base: &str) -> Result<String, String> {
    let provider_id = provider_id.trim().to_ascii_lowercase();
    if provider_id.is_empty()
        || provider_id.len() > 128
        || !provider_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
    {
        return Err("A valid provider id is required for secure credential storage.".to_string());
    }
    let endpoint = api_base.trim().trim_end_matches('/');
    if endpoint.len() > 512
        || endpoint
            .chars()
            .any(|character| "\n\r\0".contains(character))
    {
        return Err("The provider endpoint is not valid.".to_string());
    }
    Ok(format!(
        "{provider_id}:{}",
        if endpoint.is_empty() {
            "default"
        } else {
            &endpoint
        }
    ))
}

fn ssh_credential_account(credential_id: &str) -> Result<&str, String> {
    let account = credential_id.trim();
    if account.is_empty()
        || account.len() > 512
        || account
            .chars()
            .any(|character| "\n\r\0".contains(character))
    {
        return Err("A valid SSH credential identity is required.".to_string());
    }
    Ok(account)
}

fn store(endpoint: &str, secret: &str) -> Result<(), String> {
    if secret.is_empty() {
        return Err("An empty access token cannot be stored.".to_string());
    }
    let account = credential_account(endpoint)?;
    credential_chunks::save(
        &cached_slots_for_write(CREDENTIAL_SERVICE, account),
        account,
        secret,
    )
}

fn read(endpoint: &str) -> Result<Option<String>, String> {
    credential_chunks::load(
        &cached_slots(CREDENTIAL_SERVICE),
        credential_account(endpoint)?,
    )
}

fn delete(endpoint: &str) -> Result<(), String> {
    let account = credential_account(endpoint)?;
    credential_chunks::delete(
        &cached_slots_for_write(CREDENTIAL_SERVICE, account),
        account,
    )
}

/// Save one connection token in the current user's operating-system credential store.
#[tauri::command]
pub async fn credential_store(endpoint: String, secret: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || store(&endpoint, &secret))
        .await
        .map_err(|error| format!("Secure credential storage task failed: {error}"))?
}

/// Read one connection token from the current user's operating-system credential store.
#[tauri::command]
pub async fn credential_read(endpoint: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || read(&endpoint))
        .await
        .map_err(|error| format!("Secure credential storage task failed: {error}"))?
}

/// Delete one connection token from the current user's operating-system credential store.
#[tauri::command]
pub async fn credential_delete(endpoint: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete(&endpoint))
        .await
        .map_err(|error| format!("Secure credential storage task failed: {error}"))?
}

/// Save a provider key under its stable provider and endpoint identity.
#[tauri::command]
pub async fn provider_credential_store(
    provider_id: String,
    api_base: String,
    secret: String,
) -> Result<(), String> {
    if secret.is_empty() {
        return Err("An empty provider API key cannot be stored.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let account = provider_credential_account(&provider_id, &api_base)?;
        credential_chunks::save(
            &cached_slots_for_write(PROVIDER_CREDENTIAL_SERVICE, &account),
            &account,
            &secret,
        )
    })
    .await
    .map_err(|error| format!("Secure credential storage task failed: {error}"))?
}

/// Read a provider key without exposing it through any backend status API.
#[tauri::command]
pub async fn provider_credential_read(
    provider_id: String,
    api_base: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        credential_chunks::load(
            &cached_slots(PROVIDER_CREDENTIAL_SERVICE),
            &provider_credential_account(&provider_id, &api_base)?,
        )
    })
    .await
    .map_err(|error| format!("Secure credential storage task failed: {error}"))?
}

/// Remove a provider key so the provider goes back to needing one.
#[tauri::command]
pub async fn provider_credential_delete(
    provider_id: String,
    api_base: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let account = provider_credential_account(&provider_id, &api_base)?;
        credential_chunks::delete(
            &cached_slots_for_write(PROVIDER_CREDENTIAL_SERVICE, &account),
            &account,
        )
    })
    .await
    .map_err(|error| format!("Secure credential storage task failed: {error}"))?
}

fn ssh_identity_filename(credential_id: &str) -> Result<String, String> {
    let account = ssh_credential_account(credential_id)?;
    Ok(account
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || ".-_".contains(character) {
                character
            } else {
                '_'
            }
        })
        .collect())
}

/// Save a pasted private key in CLIO's private per-user application data.
#[tauri::command]
pub async fn ssh_identity_store(
    app: AppHandle,
    credential_id: String,
    private_key: String,
) -> Result<String, String> {
    if private_key.len() > 65_536
        || !private_key.contains("-----BEGIN")
        || !private_key.contains("PRIVATE KEY-----")
    {
        return Err("Paste a valid OpenSSH or PEM private key.".to_string());
    }
    let filename = ssh_identity_filename(&credential_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let directory = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("Could not locate CLIO's private data directory: {error}"))?
            .join("ssh-identities");
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not create the SSH identity directory: {error}"))?;
        let path = directory.join(filename);
        fs::write(&path, private_key.as_bytes())
            .map_err(|error| format!("Could not save the SSH identity: {error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
                .map_err(|error| format!("Could not protect the SSH identity: {error}"))?;
        }
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("SSH identity storage task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        credential_account, provider_credential_account, ssh_credential_account,
        ssh_identity_filename,
    };

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_long_credential() {
        use super::KeyringSlots;
        use crate::credential_chunks;
        let slots = KeyringSlots("ai.iowarp.clio.beta71.credential-acceptance");
        let account = format!("owned-test-{:032x}", rand::random::<u128>());
        let result = std::panic::catch_unwind(|| {
            for secret in [
                "a".repeat(8000),
                "𝄞é".repeat(1600),
                "short-replacement".into(),
            ] {
                credential_chunks::save(&slots, &account, &secret).expect("OS keyring save");
                assert_eq!(
                    credential_chunks::load(&slots, &account).expect("OS keyring read"),
                    Some(secret)
                );
            }
        });
        credential_chunks::delete(&slots, &account)
            .expect("Remove only this owned test credential");
        assert!(credential_chunks::load(&slots, &account).unwrap().is_none());
        if let Err(error) = result {
            std::panic::resume_unwind(error);
        }
    }

    #[test]
    fn connection_address_is_the_stable_credential_account() {
        assert_eq!(
            credential_account("  http://10.0.0.102:8182  "),
            Ok("http://10.0.0.102:8182")
        );
    }

    #[test]
    fn empty_connection_address_is_rejected() {
        assert!(credential_account("  ").is_err());
    }

    #[test]
    fn provider_account_uses_provider_and_normalized_endpoint() {
        assert_eq!(
            provider_credential_account(" OpenRouter ", "HTTPS://OPENROUTER.AI/api/v1/"),
            Ok("openrouter:HTTPS://OPENROUTER.AI/api/v1".to_string())
        );
        assert_eq!(
            provider_credential_account("gemini", ""),
            Ok("gemini:default".to_string())
        );
    }

    #[test]
    fn ssh_credential_identity_rejects_control_characters() {
        assert_eq!(
            ssh_credential_account("manual:alice@example.org:22"),
            Ok("manual:alice@example.org:22")
        );
        assert!(ssh_credential_account("bad\nidentity").is_err());
    }

    #[test]
    fn ssh_identity_filename_is_path_safe() {
        assert_eq!(
            ssh_identity_filename("manual:alice@example.org:22"),
            Ok("manual_alice_example.org_22".to_string())
        );
    }
}
