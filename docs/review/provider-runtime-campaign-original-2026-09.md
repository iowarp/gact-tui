# Post-Release Provider Capability and Managed-Service Campaign

**Status:** PAUSED — planning complete; implementation not started  
**Recovered from:** Codex task `Build React CLIO workspace (2)`  
**Original plan date:** 2026-09-03

## Summary

After the new release lands, build one coherent integration system that separates:

- **Configure:** provider-specific credentials, endpoints, and deployment settings.
- **Deploy:** optional desktop-managed installation and lifecycle.
- **Use:** normalized model execution through LiteLLM wherever possible.
- **Understand:** evidence-backed capability reporting for the exact model deployment.

The initial implementation covers the confirmed provider roster plus four managed-service adapters:

- CLIO-developed: CLIO Relay and CLIO Web Search.
- External: vLLM and llama.cpp.
- No synthetic inference probes, silent attachment removal, automatic OCR substitution, or capability percentages.

Work starts from the released `develop` tips using exactly two branches:

- `clio-agent`: `codex/provider-runtime-campaign`
- `gact-tui`: `codex/provider-runtime-ui`

CLIO Relay and CLIO Web Search are consumed through their released CLI/API contracts; no additional repository branches are created during this campaign.

## Core contracts and execution routing

### Provider integration

Extend the existing provider catalog rather than introducing a parallel catalog:

```ts
type ProviderIntegration = {
  id: string;
  display_name: string;
  category: "hosted_model" | "local_model" | "subscription";
  configuration_schema: ProviderConfigurationField[];
  execution_route: {
    transport: "litellm" | "codex_sdk" | "claude_code_sdk";
    provider_prefix?: string;
  };
  discovery_driver: string;
  managed_service_id?: string;
};
```

Use these execution routes:

| Configuration identity | Execution route |
|---|---|
| OpenAI | `openai/` |
| Azure OpenAI | `azure/` |
| Anthropic | `anthropic/` |
| Gemini | `gemini/` |
| Vertex AI | `vertex_ai/` |
| AWS Bedrock | `bedrock/` |
| OpenRouter | `openrouter/` |
| NVIDIA NIM | `nvidia_nim/` |
| Hosted or local vLLM | `hosted_vllm/` |
| ALCF | ALCF-specific authentication and discovery, then `hosted_vllm/` execution |
| Ollama | `ollama_chat/` |
| LM Studio | OpenAI-compatible LiteLLM execution with its configured `api_base` |
| llama.cpp | OpenAI-compatible LiteLLM execution with its configured `api_base` |
| Codex | Existing SDK-native Codex transport |
| Claude Code | Existing SDK-native Claude Code transport |

The model factory must consume the explicit execution route. It must not infer every non-native provider as `openai/<model>`.

### Capability evidence

Replace static `supports_vision` as the authority with typed assessments:

```ts
type CapabilityName =
  | "text_input"
  | "image_input"
  | "pdf_input"
  | "audio_input"
  | "video_input"
  | "tool_calling"
  | "structured_output"
  | "streaming"
  | "reasoning";

type CapabilityVerdict = "supported" | "unsupported" | "unknown";

type CapabilityClaim = {
  capability: CapabilityName;
  verdict: CapabilityVerdict;
  source:
    | "operator_override"
    | "runtime_observation"
    | "endpoint_metadata"
    | "deployment_manifest"
    | "litellm_registry"
    | "provider_catalog";
  deployment_fingerprint: string;
  observed_at: string;
  stale: boolean;
  detail_code?: string;
};

type CapabilityAssessment = {
  verdict: CapabilityVerdict;
  effective_source?: CapabilityClaim["source"];
  conflicted: boolean;
  claims: CapabilityClaim[];
};
```

Evidence precedence is:

1. Human override.
2. Conclusive result from a real user request.
3. Live, non-generative endpoint metadata.
4. CLIO-owned deployment manifest.
5. LiteLLM model metadata.
6. Provider static catalog.

Rules:

- Fingerprint evidence by provider instance, normalized endpoint, execution route, model ID/revision, and deployment configuration.
- Mark prior evidence stale when that fingerprint changes.
- Record success only when the requested feature was demonstrably used.
- Record unsupported only for a typed provider rejection of that feature.
- Authentication, quota, timeout, and transient errors do not change capability conclusions.
- “Check provider” may call health, authentication, model-list, version, and metadata endpoints. It must never call completions, responses, messages, or another inference endpoint.
- Retain legacy modality fields for older clients, derived from the effective assessment.

Add an override route scoped to the exact deployment fingerprint:

```http
PUT /v1/providers/{provider_id}/models/{model_id}/capability-overrides
```

A value may be `supported`, `unsupported`, or `clear`.

### Unknown capabilities

When a real request needs an unknown capability:

- Preserve the complete attachment.
- Warn once and offer **Send anyway** or **Choose another model**.
- A successful request or conclusive unsupported response becomes runtime evidence.
- The one-turn decision is not silently converted into a permanent override.
- Never silently strip an attachment or replace an image with OCR.

For PDFs:

- Send the original PDF when native PDF support is established.
- Otherwise use the configured structured conversion path, clearly identified as a derivative.
- Start conversion immediately after upload, independently of message submission.
- Expose real stages/events instead of fabricated percentages.
- Permit task waiting on conversion completion rather than repeated polling by the model.

## Generic managed-service lifecycle

Introduce a shared integration lifecycle:

```ts
type ManagedService = {
  id: string;
  integration_id: "clio_relay" | "clio_web_search" | "vllm" | "llama_cpp";
  ownership: "external" | "desktop_managed" | "remote_persistent";
  installation: "native" | "container" | "ssh";
  state:
    | "unconfigured"
    | "installing"
    | "starting"
    | "ready"
    | "stopping"
    | "stopped"
    | "failed";
  endpoint?: string;
  version?: string;
  deployment_fingerprint?: string;
  log_cursor?: string;
};
```

Semantics:

- **Configure** edits a service definition without starting anything.
- **Deploy** explicitly installs and starts a desktop-owned service.
- **Use** attaches a ready service to CLIO without launching a duplicate.
- Browser mode supports Configure, Connect, diagnostics, and guided instructions only.
- Desktop mode enables Deploy through a generic Tauri `ManagedServiceDriver` interface with `preflight`, `install`, `start`, `observe`, `stop`, and `logs`.
- Drivers are compiled and allowlisted; do not add an arbitrary-command execution API.
- Persist process start identity or container ID and CLIO labels, then reconcile them on restart.
- Stream real installation, model-download, startup, warmup, and failure events into Infrastructure.
- Never install GPU drivers, a container engine, or SSH itself. Detect missing prerequisites and provide the exact corrective action.
- Downloads of runtimes, images, or models require explicit confirmation and show version, source, and disk estimate.

Implement four drivers:

- **vLLM:** native `vllm serve` on supported hosts plus pinned Docker/Podman images, with accelerator, model revision, context, tensor parallelism, bind address, and token configuration. Do not depend on development-only server endpoints. Follow the official [vLLM deployment model](https://docs.vllm.ai/en/latest/deployment/docker/).
- **llama.cpp:** pinned native releases and containers, GGUF/Hugging Face model selection, context and acceleration settings, chat-template/tool capability, and multimodal projector configuration. Use `/health`, `/v1/models`, and `/props` for non-generative introspection as documented by [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).
- **CLIO Web Search:** deploy the pinned container, configure persistent storage/contact information/ports, show Docling warmup and conversion health, then connect the Web MCP automatically.
- **CLIO Relay:** install the pinned persistent `uv tool`, configure the local relay process, and provide an assisted remote wizard using saved SSH profiles. Preserve Relay’s one-time bootstrap/held-forward semantics and do not introduce per-operation SSH.

On desktop exit, if CLIO-owned services are running, show one dialog listing them:

- **Stop and quit:** gracefully stop local owned services, then use bounded force cleanup if needed.
- **Leave running:** persist ownership receipts and reconcile them on the next launch.
- **Cancel:** return to the application.

Stopping a local Relay connector must not cancel persistent remote workers, scheduler allocations, or jobs unless the user explicitly selects those separately.

## Product surfaces

### Infrastructure

Add first-class, actionable sections:

- **Model providers:** connection state, selected model, effective capabilities, evidence source, and refresh/override actions.
- **Model runtimes:** vLLM and llama.cpp deployment, endpoint, version, ownership, health, logs, and lifecycle controls.
- **Research services:** CLIO Web Search and its Web MCP connection.
- **Remote work:** CLIO Relay, configured clusters, transport mode, local connector, and remote deployment state.

Design rules:

- Show concise states such as `Images supported · deployment config` or `PDF support unknown`.
- Put fingerprints, hashes, endpoint payloads, and raw diagnostics behind technical details.
- Make unavailable providers visibly unavailable and prevent new selection while retaining an existing broken selection with a repair action.
- Keep deployment controls in Infrastructure; Settings holds advanced configuration rather than redirecting users away.
- Use progressive disclosure for provider-specific options and logs.

### Agent runtime

- Generate a concise capability manifest from the selected provider and connected services.
- Update it when the provider, model, endpoint, or managed-service fingerprint changes.
- Use it for delivery planning and relevant agent context; do not hardcode provider behavior into system prompts.
- The runtime remains authoritative about whether an attachment, tool call, or structured response can be delivered.
- Never claim native multimodal delivery when only a textual derivative was supplied.

## Test and qualification plan

### Automated tests

- Verify every provider configuration identity resolves to the intended LiteLLM or SDK route.
- Assert provider refresh performs no inference request.
- Cover capability precedence, conflicts, staleness, exact fingerprinting, overrides, and inconclusive errors.
- Verify unknown image support produces the warning and preserves the original bytes through **Send anyway**.
- Verify native PDF delivery, derivative fallback, immediate conversion start, conversion waiting, and honest progress events.
- Verify all four managed-service drivers: preflight, pinned install plan, idempotent start, port collision, log streaming, crash reporting, stop, restart, and startup reconciliation.
- Verify secrets never appear in catalog responses, logs, manifests, or diagnostics.
- Exercise exit choices and prove stopped processes are reaped while “leave running” services remain discoverable.
- Maintain backward decoding for clients that only understand legacy modality fields.

Hardware-specific suites must run in their designated environment rather than being skipped.

### Live acceptance

Using the released desktop and the built-in browser:

1. Configure and use one model through every execution-route family for which project credentials exist; report unavailable credentials as unqualified, never as passing.
2. Deploy vLLM natively on a supported Linux host and through a container on the release desktop environment.
3. Deploy llama.cpp through both native and container paths.
4. Submit a real image to multimodal vLLM and llama.cpp models and confirm the original image reaches inference.
5. Test Claude/Anthropic, Codex, OpenAI, Gemini, OpenRouter, NIM, and ALCF image/PDF behavior where credentials are available.
6. Upload a PDF and verify conversion begins immediately, exposes real progress/events, supports waiting, and remains distinguishable from native PDF delivery.
7. Deploy CLIO Web Search, wait through Docling warmup, connect its Web MCP, and complete search plus PDF conversion.
8. Configure CLIO Relay from a saved SSH profile, deploy/connect once, and prove normal operations do not repeatedly open SSH sessions.
9. Restart the UI and desktop to verify service reconciliation and capability persistence.
10. Exercise all three exit choices with native processes, containers, and Relay remote work.

The qualification report records exact release SHAs, provider/model identifiers, deployment fingerprints, tests run, browser screenshots, and any credential- or hardware-blocked rows.

## Integration and release assumptions

- Begin only after the pending release is tagged and both repositories’ `develop` branches contain the reviewed changes.
- Rebase both campaign branches directly onto those post-release tips before development and again before opening PRs.
- Open one backend PR and one dependent UI/desktop PR; do not create slice or qualification branches.
- Use the versions of LiteLLM, CLIO Relay, CLIO Web Search, vLLM, and llama.cpp pinned by the campaign.
- Add capability advertisements for evidence-backed model capabilities and desktop-managed services so older clients degrade cleanly.
- No destructive provider migration is required.
- Full A2UI work, the broader evidence-board redesign, dark-theme work, and unrelated Infrastructure cleanup remain outside this campaign.
