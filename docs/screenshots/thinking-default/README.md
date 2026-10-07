# Thinking preference save review

Changing Thinking previously entered the complete default-model bind path, including forced provider discovery and resetting the provider catalog. The UI also kept Saving visible until all dependent query refetches finished.

Thinking-only edits now copy the verified live configuration and retain credentials, transport, model capabilities and the catalog. Actual connection/model/other-setting changes still use readiness checks and forced discovery. The UI ends Saving after the write succeeds and refreshes dependent views in the background.

Actual browser clicks used the isolated CLIO service on port 8152 and the UI on 5198, with Codex/gpt-6-luna. No responses were mocked or injected. Times are one live comparison, measured from click to acknowledged HTTP write and to disappearance of Saving; they are not a latency guarantee.

| Backend | Selection | Write acknowledgement | Saving ended |
| --- | --- | ---: | ---: |
| Before | Low | 513 ms | 547 ms |
| Before | Default | 6100 ms | 6129 ms |
| After | Low | 157 ms | 227 ms |
| After | High | 131 ms | 165 ms |
| After | Default | 136 ms | 165 ms |

The before comparison already used the improved UI, so it measures the backend discovery cost separately. Low, High and Default responses and rendered selections were checked; the provider and model remained the same. A final API read confirmed the original Default preference, and the isolated config was restored byte for byte. All three final screenshots were visually reviewed. Browser review does not establish native Desktop acceptance.

Validation: the deferred-catalog UI regression and five backend behavior/integration cases ran individually with one worker, plus the existing full-bind process-default regression. Scoped lint, formatting, type checks, shared guards and online/offline UI builds passed. No full local test suite ran.

Originals, JSON timings, review script, selected check logs and SHA-256 manifest are archived at `D:/Libraries/Videos/clio_recordings/2026-10-06-thinking-save`.
