//! Operating-system credential storage for saved agent connections.

use keyring::{Entry, Error};

const CREDENTIAL_SERVICE: &str = "ai.iowarp.gact.desktop.connection";

fn credential_entry(endpoint: &str) -> Result<Entry, String> {
    let account = credential_account(endpoint)?;
    Entry::new(CREDENTIAL_SERVICE, account).map_err(credential_error)
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

fn store(endpoint: &str, secret: &str) -> Result<(), String> {
    if secret.is_empty() {
        return Err("An empty access token cannot be stored.".to_string());
    }
    credential_entry(endpoint)?
        .set_password(secret)
        .map_err(credential_error)
}

fn read(endpoint: &str) -> Result<Option<String>, String> {
    match credential_entry(endpoint)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(credential_error(error)),
    }
}

fn delete(endpoint: &str) -> Result<(), String> {
    match credential_entry(endpoint)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(credential_error(error)),
    }
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

#[cfg(test)]
mod tests {
    use super::credential_account;

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
}
