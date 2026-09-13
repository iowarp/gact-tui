# Focused Provider/Runtime Rework

## Goal

Ship one bounded release slice that wires the missing model providers through the existing DSPy/LiteLLM path and adds a small Tauri deployment mechanism for vLLM, llama.cpp, CLIO Web Search, and CLIO Relay. Codex and Claude Code remain unchanged.

## Provider wiring

- Use the provider catalog as the source of truth.
- Give each preset a stable `provider_id` and LiteLLM prefix while preserving the legacy `provider` field in saved configurations.
- Support OpenAI, Azure OpenAI, Anthropic, Gemini, Vertex AI, Bedrock, OpenRouter, NVIDIA NIM, vLLM, ALCF, Ollama, LM Studio, and llama.cpp.
- Keep all inference on DSPy/LiteLLM and add only provider-specific configuration fields.
- Forward image content through every LiteLLM transport that can carry it. Use real per-model modality evidence where the endpoint exposes it; otherwise allow delivery and let the selected upstream model return the authoritative unsupported-input error.
- Stream provider-native reasoning deltas into CLIO's collapsed thinking transcript immediately. Keep those deltas distinct from DSPy contract fields such as `reasoning` and `next_thought`, which continue streaming as generated content.
- Key stored API credentials by provider ID and endpoint. Vertex AI and Bedrock continue to use host credential chains.
- Verify generated LiteLLM model names, endpoints, options, credentials, and legacy-provider resolution without live vendor inference.

## Deployment mechanism

Expose one constrained driver interface with `preflight`, `recommendedVariant`, `install`, `start`, `status`, and `stop`. Variants contain only a pinned version, installation type, artifact or image, required target facts, and typed configuration fields.

- vLLM: pinned `v0.28.0` container variants; reject incompatible hardware, expose only the parser names registered by that pinned release, infer common model/parser pairs, and do not launch on the AMD Windows workstation or `homelab`.
- llama.cpp: pinned `v0.3.0` native/container variants with a CPU-safe default unless acceleration is proven.
- CLIO Web Search: retain its existing Docker deployment.
- CLIO Relay: install `clio-relay==1.6.8` and call its existing bootstrap, service-install, and status commands.

Targets are local or explicit SSH profiles. Users may select only compatible predefined variants; arbitrary commands, images, and versions are unsupported. The Infrastructure page shows target facts, the recommendation, compatible alternatives, lifecycle actions, and bounded logs. Browser mode is guidance-only.

## Verification

- Backend unit tests for provider routing and credentials, including legacy resolution.
- Existing focused Codex and Claude Code tests.
- Rust tests for selection, command arguments, local/SSH targets, and unsafe vLLM rejection.
- Frontend tests for provider configuration and the four deployment cards.
- A contained OpenAI-compatible reasoning-model probe that observes native reasoning deltas before DSPy's first contract-field delta.
- Focused lint, typecheck, test, and build gates.
- One contained desktop qualification: Web Search and llama.cpp may be health-checked; Relay is install/status only; vLLM and LiteLLM-backed vendor inference are not launched.

### Qualification evidence (2026-09-04)

- The local LM Studio `qwopus3.5-9b-v3` probe passed through the completed CLIO bridge: the first provider-native reasoning delta surfaced at 7.81 seconds, the first DSPy contract-field delta surfaced at 13.52 seconds, and the prediction completed with an answer.
- A live `dspy.Image` request passed through CLIO's LM factory and LiteLLM to LM Studio's vision-capable `SmolVLM-500M-Instruct`. The captured request contained one `image_url` part and the model correctly identified the CLIO logo's letter-like shape as `C`. Its unmarked `Answer: C` response also reproduced the weak-instruct-model parse failure and was retained by the answer-only blueprint recovery.
- The three vLLM reports from the earlier `aecc7bfa` backend were addressed at their owning boundaries: answer-only blueprint output recovers complete unmarked prose, guided requests cannot send `tool_choice` without `tools`, and guided `max_tokens` is bounded after DSPy formats the prompt using the handshake-discovered context window. Regression tests cover each behavior and prove the recovery remains disabled for Codex and Claude Code. A vLLM hardware rerun is still required to confirm these fixes against the DeltaAI endpoint.
- vLLM was not launched on this workstation. Docker/WSL exposed `/dev/dxg` but not the ROCm `/dev/kfd` and `/dev/dri` devices, and `rocminfo` reported no AMD GPU agent. The driver therefore continues to reject this target rather than pretending the ROCm variant is compatible.

## Deferred

Capability-evidence history, fingerprints, override APIs, attachment-policy changes, automatic restoration, elaborate receipts, a migration framework, live vendor inference, vLLM hardware qualification, and all Codex or Claude Code changes.
