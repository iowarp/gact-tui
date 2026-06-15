# GACT TUI 0.8.3 Readiness

- scope: terminal operability, provider recovery, marketplace/source proof, and live runtime catalog proof
- deterministic readiness: `5/5`
- live proof readiness: `0/5`
- release ready: `false`

| Issue | Area | Deterministic | Live proof |
| --- | --- | --- | --- |
| #150 | Terminal copy/selection | yes | no |
| #154 | Provider failure/recovery | yes | no |
| #143 | Agent Blueprint marketplace | yes | no |
| #152 | Runtime catalog breadth | yes | no |
| #152 | Runtime registry lifecycle | yes | no |

## Missing: #150 Terminal copy/selection
- Required live proof: real terminal copy/selection permutation checklist
- Missing or invalid artifacts:
  - `visual_loop/screenshots/live_terminal_copy_env.report.md (missing)`
- Notes:
  - missing live-terminal capture mode
  - incomplete checklist: CLIO drag-copy mode with mouse capture enabled, Native terminal text selection works with mouse capture disabled, Alt-drag terminal selection works while mouse capture is enabled, Detail-modal copy by key/button copies only the detail payload, Selected conversation block copy copies only the selected block, Clipboard failure path shows actionable diagnostics

## Missing: #154 Provider failure/recovery
- Required live proof: real owned-backend provider failure, retry warning, and recovered setup
- Missing or invalid artifacts:
  - `visual_loop/screenshots/live_clio_provider_failure_inline.png (missing)`
  - `visual_loop/screenshots/live_clio_provider_failure_detail.png (missing)`
  - `visual_loop/screenshots/live_clio_provider_retry_override_warning.png (missing)`
  - `visual_loop/screenshots/live_clio_provider_recovery_conversation.png (missing)`
  - `visual_loop/screenshots/live_clio_provider_recovery_setup.png (missing)`
  - `visual_loop/screenshots/live_clio_provider_recovery_manifest.json (missing)`
- Missing or false manifest keys:
  - `backend`
  - `captured_from_owned_backend`
  - `failure_session_id`
  - `recovery_session_id`
  - `retry_model`
  - `provider_failure_observed`
  - `retry_override_warning_observed`
  - `provider_recovery_observed`
  - `provider_failure_inline`
  - `provider_failure_detail`
  - `retry_override_warning`
  - `provider_recovery_conversation`
  - `provider_recovery_setup`

## Missing: #143 Agent Blueprint marketplace
- Required live proof: real source add/refresh/remove plus blueprint install/update/activation provenance
- Missing or invalid artifacts:
  - `visual_loop/screenshots/live_clio_agent_blueprint_marketplace_sources.png (missing)`
  - `visual_loop/screenshots/live_clio_agent_blueprint_marketplace_installed.png (missing)`
  - `visual_loop/screenshots/live_clio_agent_blueprint_marketplace_activated.png (missing)`
  - `visual_loop/screenshots/live_clio_agent_blueprint_marketplace_lifecycle_manifest.json (missing)`
- Missing or false manifest keys:
  - `backend`
  - `captured_from_owned_backend`
  - `source_url`
  - `source_add_success`
  - `source_refresh_success`
  - `source_remove_success`
  - `blueprint_id`
  - `blueprint_install_success`
  - `blueprint_update_success`
  - `blueprint_activation_success`
  - `source_ref`
  - `source_commit`
  - `sources_screenshot`
  - `installed_screenshot`
  - `activated_screenshot`

## Missing: #152 Runtime catalog breadth
- Required live proof: live owned-backend tools/MCP/source catalog breadth
- Missing or invalid artifacts:
  - `visual_loop/screenshots/live_clio_runtime_tools_catalog.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_tools_detail.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_mcp_catalog.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_mcp_detail.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_blueprint_sources.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json (missing)`
- Missing or false manifest keys:
  - `backend`
  - `captured_from_owned_backend`
  - `tools_catalog`
  - `tools_detail`
  - `mcp_catalog`
  - `mcp_detail`
  - `agent_blueprint_sources`

## Missing: #152 Runtime registry lifecycle
- Required live proof: real registry-backed MCP install/remove and source refresh lifecycle
- Missing or invalid artifacts:
  - `visual_loop/screenshots/live_clio_runtime_mcp_install_success.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_mcp_remove_success.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_source_refresh_success.png (missing)`
  - `visual_loop/screenshots/live_clio_runtime_registry_lifecycle_manifest.json (missing)`
- Missing or false manifest keys:
  - `backend`
  - `captured_from_owned_backend`
  - `mcp_install_success`
  - `mcp_remove_success`
  - `source_refresh_success`
  - `mcp_install_screenshot`
  - `mcp_remove_screenshot`
  - `source_refresh_screenshot`
