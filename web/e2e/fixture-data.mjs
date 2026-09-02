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
    reasoning: { supported: true, parameter: 'reasoning_effort' },
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
