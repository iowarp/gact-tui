//! Check a published release using the product's existing updater key and asset policy.

use serde::Serialize;
use std::time::Duration;
use tauri::{Manager, ResourceId, Webview};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateMetadata {
    rid: ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

/// Substitute only the tag in a trusted, configured GitHub updater endpoint.
fn release_endpoint(configured: &str, tag: &str) -> Result<String, String> {
    if !tag.starts_with('v')
        || tag.len() > 128
        || !tag
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b".-+".contains(&byte))
    {
        return Err("Invalid release tag".into());
    }
    let (repository, asset) = configured
        .split_once("/releases/latest/download/")
        .ok_or("The configured updater does not support release channels")?;
    let repo = repository
        .strip_prefix("https://github.com/")
        .ok_or("Release channels require a configured GitHub updater")?;
    if repo.split('/').count() != 2 || !matches!(asset, "latest.json" | "latest-lite.json") {
        return Err("Unsupported configured release feed".into());
    }
    Ok(format!("{repository}/releases/download/{tag}/{asset}"))
}

/// Return a normal updater resource; downloading still verifies the configured signature.
#[tauri::command]
pub(crate) async fn check_release_update(
    webview: Webview,
    tag: String,
) -> Result<Option<UpdateMetadata>, String> {
    let configured = webview
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("endpoints"))
        .and_then(|value| value.as_array())
        .and_then(|values| values.first())
        .and_then(|value| value.as_str())
        .ok_or("No updater feed is configured for this product")?;
    let endpoint = release_endpoint(configured, &tag)?
        .parse()
        .map_err(|error| format!("Invalid configured updater URL: {error}"))?;
    let updater = webview
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    Ok(Some(UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date: update
            .raw_json
            .get("pub_date")
            .and_then(|value| value.as_str())
            .map(String::from),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}

#[cfg(test)]
mod tests {
    use super::release_endpoint;

    #[test]
    fn preserves_the_brand_repository_and_manifest_variant() {
        for name in ["latest.json", "latest-lite.json"] {
            assert_eq!(
                release_endpoint(
                    &format!("https://github.com/example/product/releases/latest/download/{name}"),
                    "v0.9.5-beta.2"
                )
                .unwrap(),
                format!(
                    "https://github.com/example/product/releases/download/v0.9.5-beta.2/{name}"
                )
            );
        }
    }

    #[test]
    fn refuses_url_or_path_injection_and_unconfigured_feeds() {
        let configured = "https://github.com/example/product/releases/latest/download/latest.json";
        for tag in [
            "v1/../../other",
            "https://elsewhere.invalid",
            "v1?x=y",
            "v1#fragment",
            "v1%2Fother",
        ] {
            assert!(release_endpoint(configured, tag).is_err());
        }
        assert!(release_endpoint(
            "https://elsewhere.invalid/releases/latest/download/latest.json",
            "v1.0.0"
        )
        .is_err());
    }
}
