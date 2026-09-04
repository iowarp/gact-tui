# Focused Provider/Runtime Rework

## Goal

Ship one bounded release slice that wires the missing model providers through the existing DSPy/LiteLLM path and adds a small Tauri deployment mechanism for vLLM, llama.cpp, CLIO Web Search, and CLIO Relay. Codex and Claude Code remain unchanged.

## Provider wiring

- Use the provider catalog as the source of truth.
- Give each preset a stable `provider_id` and LiteLLM prefix while preserving the legacy `provider` field in saved configurations.
- Support OpenAI, Azure OpenAI, Anthropic, Gemini, Vertex AI, Bedrock, OpenRouter, NVIDIA NIM, vLLM, ALCF, Ollama, LM Studio, and llama.cpp.
- Keep all inference on DSPy/LiteLLM and add only provider-specific configuration fields.
- Key stored API credentials by provider ID and endpoint. Vertex AI and Bedrock continue to use host credential chains.
- Verify generated LiteLLM model names, endpoints, options, credentials, and legacy-provider resolution without live vendor inference.

## Deployment mechanism

Expose one constrained driver interface with `preflight`, `recommendedVariant`, `install`, `start`, `status`, and `stop`. Variants contain only a pinned version, installation type, artifact or image, required target facts, and typed configuration fields.

- vLLM: pinned `v0.28.0` container variants; reject incompatible hardware and do not launch on the AMD Windows workstation or `homelab`.
- llama.cpp: pinned `v0.3.0` native/container variants with a CPU-safe default unless acceleration is proven.
- CLIO Web Search: retain its existing Docker deployment.
- CLIO Relay: install `clio-relay==1.6.8` and call its existing bootstrap, service-install, and status commands.

Targets are local or explicit SSH profiles. Users may select only compatible predefined variants; arbitrary commands, images, and versions are unsupported. The Infrastructure page shows target facts, the recommendation, compatible alternatives, lifecycle actions, and bounded logs. Browser mode is guidance-only.

## Verification

- Backend unit tests for provider routing and credentials, including legacy resolution.
- Existing focused Codex and Claude Code tests.
- Rust tests for selection, command arguments, local/SSH targets, and unsafe vLLM rejection.
- Frontend tests for provider configuration and the four deployment cards.
- Focused lint, typecheck, test, and build gates.
- One contained desktop qualification: Web Search and llama.cpp may be health-checked; Relay is install/status only; vLLM and LiteLLM-backed vendor inference are not launched.

## Deferred

Capability-evidence history, fingerprints, override APIs, attachment-policy changes, automatic restoration, elaborate receipts, a migration framework, live vendor inference, vLLM hardware qualification, and all Codex or Claude Code changes.
