/**
 * The rows the Playwright fixture serves.
 *
 * Held apart from the request router so the shapes a test reasons about are
 * readable on their own, and so the server file stays a router rather than
 * growing a data section every time a surface needs one more realistic row.
 * Every shape here is the reference backend's, defaults included: a field the
 * service always serialises at its empty default is present and empty, never
 * omitted.
 */

export const observedAt = '2026-08-22T20:00:00.000Z';
export const workspaceId = 'ws_flat_ndp';
export const sessionId = 'sess_flat_ndp';

export const behavior = {
  reasoning_effort: 'medium',
  execution_mode: 'execute',
  confirmation_policy: 'ask',
};

/**
 * One discovered provider that answered, and one that did not.
 *
 * An empty catalog routes the live-catalog code path around itself: the client
 * falls back to configured presets and nothing about provider health, model
 * availability, or a provider with no models is ever rendered. Both shapes are
 * carried here so the picker's real branches are exercised.
 */
function providerCatalogModel(overrides) {
  return {
    provider_id: 'lmstudio',
    provider_kind: 'lmstudio',
    endpoint: 'http://127.0.0.1:1234/v1',
    deployment: 'local',
    model_id: 'qwen3-30b',
    revision: '',
    modalities: ['text'],
    reasoning: {
      supported: true,
      parameter: 'reasoning_effort',
      levels: ['low', 'medium', 'high'],
      default: 'medium',
      source: 'served_model_reasoning_parser',
    },
    native_tool_calling: true,
    context_window: 262144,
    loaded_context_window: 131072,
    output_limit: 8192,
    availability: 'available',
    evidence: {
      source: 'live_handshake',
      generated_at: observedAt,
      live: true,
      context_source: 'model_card',
    },
    failure: '',
    ...overrides,
  };
}

/** One response setting a model accepts (clio-schemas AcceptedParameter). */
function acceptedParameter(name, label, group, kind, minimum, maximum, step, default_ = null) {
  return {
    name,
    label,
    group,
    kind,
    minimum,
    maximum,
    step,
    options: [],
    default: default_,
    description: `${label} changes the reply.`,
    evidence: [{ source: 'litellm', detail: `${name} accepted`, observed_at: '' }],
  };
}

export const providerCatalog = {
  catalog_id: 'active',
  authoritative: 'live_handshake',
  providers: [
    {
      id: 'lmstudio',
      name: 'LM Studio',
      kind: 'lmstudio',
      endpoint: 'http://127.0.0.1:1234/v1',
      configuration_url: '/settings/providers?provider=lmstudio',
      connectivity: 'ok',
      auth: 'not_required',
      health: 'ready',
      freshness: { generated_at: observedAt, source: 'live_handshake' },
      failure: '',
      models: [
        providerCatalogModel({}),
        providerCatalogModel({
          model_id: 'qwen3-vl-8b',
          modalities: ['text', 'image'],
          loaded_context_window: null,
        }),
        providerCatalogModel({
          model_id: 'deepseek-r1-70b',
          availability: 'candidate',
          context_window: null,
          loaded_context_window: null,
          output_limit: null,
          evidence: {
            source: 'configured_presets',
            generated_at: observedAt,
            live: false,
            context_source: '',
          },
          failure: 'Reported by the catalog but never loaded on this host.',
        }),
      ],
    },
    {
      // The active model: its real Codex efforts drive the composer control.
      id: 'codex',
      name: 'OpenAI Codex',
      kind: 'codex',
      endpoint: 'codex://direct',
      configuration_url: '/settings/providers?provider=codex',
      connectivity: 'ok',
      auth: 'ok',
      health: 'ready',
      freshness: { generated_at: observedAt, source: 'overlay' },
      failure: '',
      models: [
        providerCatalogModel({
          provider_id: 'codex',
          provider_kind: 'codex',
          endpoint: 'codex://direct',
          deployment: '',
          model_id: 'gpt-5.6-luna',
          modalities: ['text', 'image'],
          reasoning: {
            supported: true,
            parameter: '',
            levels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
            default: 'medium',
            source: 'codex_direct_model_list',
          },
          context_window: 262144,
          loaded_context_window: null,
          output_limit: 128000,
          // The response settings the model accepts, for the Settings > Models page.
          accepted_parameters: [
            acceptedParameter('temperature', 'Temperature', 'sampling', 'number', 0, 2, 0.05, 0.7),
            acceptedParameter('top_p', 'Top P', 'sampling', 'number', 0, 1, 0.01),
            acceptedParameter('max_tokens', 'Longest reply', 'length', 'integer', 1, 128000, 256),
            acceptedParameter('parallel', 'Replies at once', 'advanced', 'integer', 1, null, 1),
          ],
          evidence: {
            source: 'overlay',
            generated_at: observedAt,
            live: false,
            context_source: 'models.dev',
          },
        }),
      ],
    },
    {
      id: 'argonne',
      name: 'Argonne ALCF',
      kind: 'argonne',
      endpoint: 'https://inference.alcf.anl.gov/v1',
      configuration_url: '/settings/providers?provider=argonne',
      connectivity: 'unreachable',
      auth: 'missing',
      health: 'unavailable',
      freshness: { generated_at: observedAt, source: 'live_handshake' },
      failure: 'Sign-in has expired for this test-owned fixture.',
      models: [],
    },
  ],
};

/** The cloud preset `/v1/providers/lm` always reports: the active model by default. */
export const codexPreset = {
  id: 'codex',
  label: 'Codex',
  provider: 'codex',
  api_base: 'codex://direct',
  suggested_model: 'gpt-5.6-luna',
  requires_api_key: false,
  is_authenticated: true,
  supports_live_catalog: true,
  supports_vision: true,
};

function localPreset({ id, label, provider, litellmPrefix, apiBase, suggested, description }) {
  return {
    id,
    provider_id: id,
    label,
    provider,
    litellm_prefix: litellmPrefix,
    api_base: apiBase,
    suggested_model: suggested,
    requires_api_key: false,
    auth_method: 'none',
    auth_label: '',
    is_authenticated: true,
    description,
    status: 'ready',
    status_message: '',
    supports_live_catalog: true,
    supports_vision: false,
    configuration_fields: [],
    supports_runtime_sizing: false,
    managed_service_id: '',
    supports_logout: false,
  };
}

/**
 * The model servers a person runs on their own hardware, as the service's
 * presets report them: no key, no sign-in, an http address. `vllm` is also the
 * preset every custom OpenAI-compatible server is reached through. The server
 * fills `status`/`status_message` from whether the runtime answers right now.
 */
export const localServerPresets = [
  localPreset({
    id: 'ollama',
    label: 'Ollama',
    provider: 'ollama',
    litellmPrefix: 'ollama_chat',
    apiBase: 'http://localhost:11434/v1',
    suggested: 'qwen3:32b',
    description: 'Locally-hosted models via Ollama.',
  }),
  localPreset({
    id: 'lmstudio',
    label: 'LM Studio',
    provider: 'lm_studio',
    litellmPrefix: 'lm_studio',
    apiBase: 'http://localhost:1234/v1',
    suggested: 'qwen3-30b',
    description: 'Locally-hosted models via LM Studio.',
  }),
  localPreset({
    id: 'llama_cpp',
    label: 'llama.cpp',
    provider: 'openai',
    litellmPrefix: 'openai',
    apiBase: 'http://localhost:8080/v1',
    suggested: 'Qwen3-8B-Q4_K_M.gguf',
    description: 'A llama.cpp server (llama-server) on this computer.',
  }),
  {
    ...localPreset({
      id: 'vllm',
      label: 'vLLM or other OpenAI-compatible server',
      provider: 'openai',
      litellmPrefix: 'hosted_vllm',
      apiBase: 'http://localhost:8000/v1',
      suggested: '',
      description: 'Any OpenAI-compatible server: vLLM, SGLang, TGI or your own.',
    }),
    supports_vision: true,
  },
];

/** What each local runtime serves while it runs, with each model's context window. */
export const localRuntimeModels = {
  ollama: [
    { id: 'qwen3:32b', context_window: 40960 },
    { id: 'qwen3:8b', context_window: 40960 },
    { id: 'llama3.3:70b', context_window: 131072 },
    { id: 'gemma3:27b', context_window: 131072 },
    { id: 'nomic-embed-text', context_window: 8192 },
    { id: 'mistral-small3.2', context_window: 131072 },
  ],
  lmstudio: [
    { id: 'qwen3-30b', context_window: 262144 },
    { id: 'text-embedding-nomic-embed-text-v1.5', context_window: 2048 },
  ],
  llama_cpp: [{ id: 'Qwen3-8B-Q4_K_M.gguf', context_window: 40960 }],
};

const noReasoning = { supported: false, parameter: '', levels: [], default: '', source: '' };

/** Ollama answering with its six models: the default model in the settings spec. */
export const ollamaCatalogEntry = {
  id: 'ollama',
  name: 'Ollama',
  kind: 'ollama',
  endpoint: 'http://localhost:11434/v1',
  configuration_url: '/settings/providers?provider=ollama',
  connectivity: 'ok',
  auth: 'not_required',
  health: 'ready',
  freshness: { generated_at: observedAt, source: 'live_handshake' },
  failure: '',
  models: localRuntimeModels.ollama.map(({ id, context_window }) =>
    providerCatalogModel({
      provider_id: 'ollama',
      provider_kind: 'ollama',
      endpoint: 'http://localhost:11434/v1',
      model_id: id,
      context_window,
      loaded_context_window: id === 'qwen3:32b' ? 32768 : null,
      output_limit: null,
      availability: id === 'nomic-embed-text' ? 'not_chat' : 'available',
      chat_selectable: id === 'nomic-embed-text' ? false : undefined,
      native_tool_calling: id !== 'nomic-embed-text',
      reasoning: id.startsWith('qwen3')
        ? {
            supported: true,
            parameter: 'think',
            levels: ['low', 'medium', 'high'],
            default: 'medium',
            source: 'ollama_show',
          }
        : noReasoning,
      accepted_parameters:
        id === 'nomic-embed-text'
          ? []
          : [
              acceptedParameter(
                'temperature',
                'Temperature',
                'sampling',
                'number',
                0,
                2,
                0.05,
                0.7,
              ),
              acceptedParameter('top_p', 'Top P', 'sampling', 'number', 0, 1, 0.01),
              acceptedParameter(
                'max_tokens',
                'Longest reply',
                'length',
                'integer',
                1,
                context_window,
                256,
              ),
              acceptedParameter('parallel', 'Replies at once', 'advanced', 'integer', 1, 8, 1),
            ],
      evidence: {
        source: 'live_handshake',
        generated_at: observedAt,
        live: true,
        context_source: 'ollama_show',
      },
      context_controls:
        id === 'nomic-embed-text'
          ? undefined
          : {
              semantics: 'model',
              maximum: context_window,
              maximum_reason: 'Reported by Ollama for this model.',
              minimum: 256,
              current: id === 'qwen3:32b' ? 32768 : context_window,
              current_choice: id === 'qwen3:32b' ? 'number' : 'max',
              current_reason: id === 'qwen3:32b' ? 'Set in Settings.' : 'The model’s maximum.',
              fit_to_gpu: {
                available: false,
                reason: 'CLIO binds this model but does not run it.',
                strategy: '',
                strategies: [],
              },
            },
    }),
  ),
};

/** LM Studio saved but not running: it answered nothing at its address. */
export const lmStudioNotRunningCatalogEntry = {
  ...providerCatalog.providers[0],
  endpoint: 'http://localhost:1234/v1',
  connectivity: 'unreachable',
  health: 'unavailable',
  failure: 'No answer at http://localhost:1234/v1',
  models: [],
};

/**
 * One compaction record: a `summarization` injection carrying the summary the
 * agent received. Compaction APPENDS it to the transcript rather than replacing
 * it, so earlier messages stay reachable above the row.
 */
export const compactionCheckpoint = {
  id: 'block_compaction',
  type: 'injection',
  source: 'summarization',
  trigger: 'auto',
  compaction_id: 'cmp_fixture',
  text:
    'The agent reviewed the EarthScope station evidence ledger, cross-checked coverage against ' +
    'quality flags, and confirmed the derived displacement series before this checkpoint. Earlier ' +
    'messages remain in the transcript above this row and can be reopened at any time.',
};

/** One steer accepted for the next safe boundary, on a real transcript message. */
export const pendingSteer = {
  message_id: 'msg_fixture_request',
  session_id: sessionId,
  parts: [
    { type: 'text', text: 'Review the EarthScope station evidence and keep provenance visible.' },
  ],
  text: 'Review the EarthScope station evidence and keep provenance visible.',
  metadata: {},
  accepted_at: observedAt,
  behavior,
  model: { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
  state: 'pending',
  // The service always serialises these; they are empty until their transition.
  claimed_at: '',
  consumed_at: '',
  cancelled_at: '',
};

/** One registered resource, carrying the nested processing record custody adds. */
export const readyResource = {
  id: 'res_stations',
  workspace_id: workspaceId,
  client_upload_id: 'browser-fixture-stations',
  revision: 1,
  name: 'stations.csv',
  claimed_mime: 'text/csv',
  detected_mime: 'text/csv',
  detection_source: 'content_sniff',
  declared_size: 2048,
  received_size: 2048,
  sha256: 'fixture-stations-sha256',
  state: 'ready',
  failure: '',
  created_at: '2026-08-22T19:30:00.000Z',
  updated_at: observedAt,
  completed_at: observedAt,
  mime_mismatch: false,
  processing: {
    workspace_id: workspaceId,
    resource_id: 'res_stations',
    resource_revision: 1,
    source_sha256: 'fixture-stations-sha256',
    processor: '',
    processor_url: '',
    job_id: '',
    query_tool: 'workspace_resource_inspect',
    state: 'not_started',
    progress: 0,
    derivatives_available: false,
    failure: {},
    cancellation: {},
    created_at: '2026-08-22T19:30:00.000Z',
    updated_at: observedAt,
  },
};

const spend = (tokens, cost) => ({
  tokens_input: Math.round(tokens * 0.7),
  tokens_cached: Math.round(tokens * 0.2),
  tokens_output: Math.round(tokens * 0.1),
  tokens,
  cost_usd: cost,
  turns_without_cost: 0,
  turns: Math.max(1, Math.round(tokens / 40_000)),
});

/** Settings > Usage: one account of each billing kind, resets relative to now. */
export function settingsUsageAccounts(now = Date.now()) {
  const at = (minutes) => new Date(now + minutes * 60_000).toISOString();
  const observed = new Date(now - 3 * 60_000).toISOString();
  const usage = (account, extra) => ({
    account,
    state: 'metered',
    observed_at: observed,
    source: 'provider',
    windows: [],
    balance: null,
    status: '',
    read_failure: '',
    read_failed_at: '',
    ...extra,
  });
  return [
    {
      id: 'openai-codex',
      label: 'ChatGPT Pro',
      provider_kind: 'codex',
      billing: 'subscription',
      health: 'ready',
      failure: '',
      endpoint: '',
      usage: usage('openai-codex', {
        windows: [
          { name: '5 hour', used_percent: 62, resets_at: at(134), window_minutes: 300 },
          {
            name: 'Weekly',
            used_percent: 31,
            resets_at: at(3 * 1440 + 300),
            window_minutes: 10080,
          },
        ],
      }),
      usage_missing_reason: '',
      spend: spend(1_840_000, 0),
      delegation_allowed: true,
    },
    {
      id: 'github-copilot',
      label: 'GitHub Copilot',
      provider_kind: 'copilot',
      billing: 'subscription',
      health: 'ready',
      failure: '',
      endpoint: '',
      usage: usage('github-copilot', {
        windows: [
          {
            name: 'Premium requests',
            used_percent: 86,
            resets_at: at(9 * 1440),
            window_minutes: null,
          },
        ],
        read_failure: 'timed out',
        read_failed_at: observed,
      }),
      usage_missing_reason: '',
      spend: spend(420_000, 0),
      delegation_allowed: false,
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      provider_kind: 'openai-compatible',
      billing: 'credit',
      health: 'ready',
      failure: '',
      endpoint: 'https://openrouter.ai/api/v1',
      usage: usage('openrouter', {
        balance: { remaining: 18.42, limit: 50, used: 31.58, currency: 'USD' },
      }),
      usage_missing_reason: '',
      spend: spend(960_000, 4.18),
      delegation_allowed: true,
    },
    {
      id: 'anthropic',
      label: 'Anthropic API',
      provider_kind: 'anthropic',
      billing: 'metered',
      health: 'unauthorized',
      failure: '401 invalid x-api-key',
      endpoint: 'https://api.anthropic.com',
      usage: null,
      usage_missing_reason: 'not_supported',
      spend: spend(210_000, 2.71),
      delegation_allowed: false,
    },
    {
      id: 'ollama',
      label: 'Ollama',
      provider_kind: 'ollama',
      billing: 'free',
      health: 'ready',
      failure: '',
      endpoint: 'http://127.0.0.1:11434',
      usage: usage('ollama', { state: 'unmetered', source: 'local' }),
      usage_missing_reason: '',
      spend: spend(3_200_000, 0),
      delegation_allowed: true,
    },
  ];
}
