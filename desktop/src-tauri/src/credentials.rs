//! Operating-system credential storage for saved agent connections.

use keyring::{Entry, Error};

const CREDENTIAL_SERVICE: &str = "ai.iowarp.gact.desktop.connection";
const PROVIDER_CREDENTIAL_SERVICE: &str = "ai.iowarp.gact.desktop.provider";

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

fn provider_entry(provider_id: &str, api_base: &str) -> Result<Entry, String> {
    let account = provider_credential_account(provider_id, api_base)?;
    Entry::new(PROVIDER_CREDENTIAL_SERVICE, &account).map_err(credential_error)
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
        provider_entry(&provider_id, &api_base)?
            .set_password(&secret)
            .map_err(credential_error)
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
        match provider_entry(&provider_id, &api_base)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(credential_error(error)),
        }
    })
    .await
    .map_err(|error| format!("Secure credential storage task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{credential_account, provider_credential_account};

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
}
