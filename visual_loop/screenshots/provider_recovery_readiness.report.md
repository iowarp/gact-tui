# Provider Recovery Visual Readiness

- ready for maintained deterministic provider proof: `true`
- deterministic evidence: `2/2`
- deferred live provider evidence: `0/1`

| Area | Evidence | Required | Ready |
| --- | --- | --- | --- |
| Provider setup | provider setup, auth-required, auth-failure, auth-success, and narrow layout | yes | yes |
| Provider failure and retry | operator-readable provider failure detail and retry override warning | yes | yes |
| Live provider recovery | real owned-backend provider failure, retry warning, and recovered setup | deferred | no |

## Missing: Live provider recovery - real owned-backend provider failure, retry warning, and recovered setup
- Missing or invalid artifacts:
  - `visual_loop/screenshots/live_clio_provider_failure_inline.png` (missing)
  - `visual_loop/screenshots/live_clio_provider_failure_detail.png` (missing)
  - `visual_loop/screenshots/live_clio_provider_retry_override_warning.png` (missing)
  - `visual_loop/screenshots/live_clio_provider_recovery_conversation.png` (missing)
  - `visual_loop/screenshots/live_clio_provider_recovery_setup.png` (missing)
  - `visual_loop/screenshots/live_clio_provider_recovery_manifest.json` (missing)
- Manifest status: `missing`
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
