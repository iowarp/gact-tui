/**
 * Route-level mock backend, shaped from OBSERVED REALITY.
 *
 * The capability flags below were captured from a live clio-agent
 * (`develop` @ `fbf7215e`, `GET /v1/capabilities`) rather than invented, and
 * the message parts are shaped from the emitters that construct them — see
 * `contract/PARTS.md` for the citations.
 *
 * This still proves NOTHING about live correctness. Bringing a real backend up
 * immediately produced two defects no fixture had ever shown (clio-agent#1171,
 * and CORS closed by default). The mock exists so the surfaces can be
 * exercised deterministically in CI; the live gate is a separate thing and
 * lives in `live-backend.spec.ts`.
 *
 * The full fixture corpus is P5.1's visual-harness scope (gact-tui#340) —
 * this file must not grow into a second one.
 */
import type { Page, Route } from '@playwright/test';

export const MOCK_BACKEND = 'http://mock.test';

export const MOCK_SESSION_ID = 'sess_boot_0001';

/** Contract version the app requires; a mismatch is a loud refusal (P4.6b).
 *  Matches the REAL backend's value (`gact/types.py: contract_version = "0.2"`),
 *  not the `GACT v0.2` prose spelling used in docs. */
export const MOCK_CONTRACT = '0.2';

export interface MockBackendOptions {
  /** Override the advertised contract version to exercise the refusal path. */
  contract?: string;
  /** Fail every request with this status instead of serving fixtures. */
  failWithStatus?: number;
  /**
   * Serve the fixtures on a different origin than MOCK_BACKEND — e.g. the
   * brand-default `http://127.0.0.1:17800` the boot splash probes (slice F).
   */
  origin?: string;
  /**
   * Volume fixtures for overflow semantics (B10/B13): twelve workspaces, the
   * first holding eight sessions so `show more (3)` fires and the rail
   * overflows the viewport.
   */
  stress?: boolean;
}

/** Deterministic volume fixtures — see MockBackendOptions.stress. */
function stressFixtures() {
  const workspaces = Array.from({ length: 12 }, (_, i) => ({
    id: `ws_stress_${String(i + 1).padStart(2, '0')}`,
    name: `stress-ws-${String(i + 1).padStart(2, '0')}`,
    root_path: `/scratch/stress-${String(i + 1).padStart(2, '0')}`,
  }));
  const sessions = [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `sess_stress_${i + 1}`,
      title: `stress-${String(i + 1).padStart(2, '0')}`,
      status: 'idle',
      created_at: '2026-08-03T00:00:00Z',
      updated_at: '2026-08-03T00:00:00Z',
      workspace_id: 'ws_stress_01',
    })),
    ...workspaces.slice(1).map((ws, i) => ({
      id: `sess_stress_ov_${i + 1}`,
      title: `stress overflow ${String(i + 1).padStart(2, '0')}`,
      status: 'idle',
      created_at: '2026-08-03T00:00:00Z',
      updated_at: '2026-08-03T00:00:00Z',
      workspace_id: ws.id,
    })),
  ];
  return { workspaces, sessions };
}

/** The nested Capabilities envelope, flags copied from a live capture.
 *  Capability gating reads `caps.capabilities.<flag>`, never `caps.<flag>`. */
const capabilities = (contract: string) => ({
  contract_version: contract,
  backend: {
    name: 'clio-agent-gact',
    version: '0.9.0+fbf7215e',
    vendor: 'iowarp',
    homepage: 'https://github.com/iowarp/clio-agent',
  },
  capabilities: {
    workspaces: true,
    sessions: true,
    subagents: true,
    mcp: true,
    lsp: false,
    files: true,
    diffs: true,
    permissions: true,
    providers: true,
    commands: true,
    voice: false,
    scheduled_sessions: true,
    hooks: true,
    session_tasks: true,
    metrics: true,
    session_branching: true,
    session_sharing: true,
    session_export: true,
    session_summary: false,
    attachments_upload: false,
    multimodal_image_parts: true,
    cost_tracking: true,
  },
  transports: { sse: true },
  auth: { schemes: ['trust_socket'] },
  extensions: [],
});

/**
 * A message carrying every part kind clio-agent actually emits today.
 *
 * Shapes follow the emitters, not the prototype: `background_exit` from
 * `gact/background_exit.py` (note `exit_status: "canceled"`, one l, mapped
 * from the two-l task status) and `agent_message` from
 * `gact/agent_messaging.py`, both including the run-handle group produced by
 * `run_handle_fields()`.
 */
export const MOCK_WIRE_MESSAGE = {
  id: 'msg_wire_0001',
  role: 'assistant',
  parts: [
    // Field names below are the EMITTERS', not plausible ones. Verified against
    // contract/testdata/observed-part-model-v0.3.json (the 56-field flat union
    // reflected off clio-agent 0.9.0+42522bb1) and observed-parts-v0.3.json
    // (real parts read out of live session ledgers). tests/unit/
    // wire-conformance.test.ts fails on any field the model does not declare.
    {
      // gact/transcript: provider chain-of-thought lands in `text`. It is NOT
      // a `thinking` field, and there is no token count on the part.
      type: 'thinking',
      agent_id: 'main',
      text: 'Resolving the region before staging data.',
      metadata: {
        thinking_source: 'provider',
        provider_source: 'claude_code_sdk',
        default_collapsed: true,
        stream_source: 'live',
      },
    },
    { type: 'text', agent_id: 'main', text: 'Starting with the geospatial child.' },
    {
      // gact/live_handle: the delegate is `child_agent`; the question rides in
      // metadata, which is where the live ledger carries it.
      type: 'expert_handoff',
      id: 'live_handoff_a4fc52c182b4',
      agent_id: 'main',
      parent_agent: 'main',
      child_agent: 'geospatial',
      metadata: {
        agent_id: 'geospatial',
        delegate_to: 'geospatial',
        delegation_lifecycle: 'sync',
        depth: 0,
        execute: true,
        execution_mode: 'blueprint_react',
        parent_id: 'main',
        question: 'Resolve Los Angeles into grounded coordinates.',
        source: 'agent_next_expert',
        stream_source: 'live',
      },
    },
    {
      type: 'tool_call',
      id: 'live_call_a4c19b2e_call',
      agent_id: 'data',
      call_id: 'call_a4c19b2e',
      tool_name: 'stage_resource',
      input: { resource: 'earthscope_stations.csv', source: 'ds2.datacollaboratory.org' },
      sequence: 7,
      metadata: { stream_source: 'live', telemetry_source: 'live_observer' },
    },
    {
      // `content` is a LIST OF PARTS on the wire, never a bare string.
      type: 'tool_result',
      id: 'live_call_a4c19b2e_result',
      agent_id: 'data',
      call_id: 'call_a4c19b2e',
      is_error: false,
      duration_ms: 412.0,
      content: [
        {
          type: 'text',
          id: 'live_call_a4c19b2e_result_final_text',
          text: 'staged 1,101 rows',
        },
      ],
      metadata: { stream_source: 'live' },
    },
    {
      // artifacts/wire.py:186
      type: 'resource_link',
      id: 'part_resource_link_5f21c9d0',
      agent_id: 'data',
      server_id: 'clio-artifacts',
      uri: 'artifact://ws_default/earthscope_stations.csv@1',
      name: 'earthscope_stations.csv',
      mime_type: 'text/csv',
      metadata: { workspace_id: 'ws_default', version: 1 },
    },
    {
      // turn_finalize.py:444
      type: 'file_diff',
      id: 'part_file_diff_7c2a',
      agent_id: 'main',
      path: 'analysis/profile.py',
      unified_diff: [
        '--- a/analysis/profile.py',
        '+++ b/analysis/profile.py',
        '@@ -1,2 +1,3 @@',
        ' import pandas',
        '+import numpy',
        '',
      ].join('\n'),
      new_content: '',
      status: 'pending',
      edit_mode: 'diff',
      lines_added: 1,
      lines_removed: 0,
    },
    {
      // mcp_apps.py:439 — addressed by resource_uri + app_instance_id, not `uri`.
      type: 'mcp_app',
      id: 'mcp_app_app_3f9c1d',
      agent_id: 'data',
      app_instance_id: 'app_3f9c1d',
      resource_uri: 'ui://ndp/station-picker',
      source_server: 'ndp',
      data_ref: '',
      mime_type: 'text/html;profile=mcp-app',
      metadata: { stream_source: 'live', protocol: '2026-01-26' },
    },
    {
      // routes/compaction.py:60 — summary/auto/compacted_message_ids, no `reason`.
      type: 'compaction',
      id: 'part_compact_9b21c7d0aa',
      summary: 'Folded 12 turns of station discovery into a standing summary.',
      auto: true,
      compacted_message_ids: ['msg_0007', 'msg_0008', 'msg_0009'],
      metadata: { stream_source: 'batch' },
    },
    {
      type: 'background_exit',
      id: 'live_background_exit_b899efeeca04',
      agent_id: 'data',
      parent_agent: 'main',
      child_agent: 'data',
      handle_id: 'task_b899efeeca04',
      run_label: 'data #1',
      live_state: 'completed',
      host: 'ares',
      placement: 'relay:ares',
      task_id: 'task_b899efeeca04',
      job_id: 'task_b899efeeca04',
      exit_status: 'completed',
      artifact_ref: 'artifact://ws_default/earthscope_stations.csv@1',
      status: 'completed',
      metadata: { stream_source: 'live' },
    },
    {
      type: 'agent_message',
      agent_id: 'main',
      parent_agent: 'main',
      child_agent: 'data',
      stage: 'message.queued',
      handle_id: 'task_b899efeeca04',
      run_label: 'data #1',
      live_state: 'running',
      host: 'local',
      placement: 'local',
      message_action: 'queue',
      status: 'accepted',
      text: 'also profile the uncertainty columns',
    },
  ],
};

const sessions = () => ({
  sessions: [
    {
      id: MOCK_SESSION_ID,
      title: 'Boot smoke session',
      status: 'idle',
      created_at: '2026-08-03T00:00:00Z',
      updated_at: '2026-08-03T00:00:00Z',
      workspace_id: 'ws_default',
    },
  ],
});

/** Install network interception for the mock backend origin. */
export async function installMockBackend(
  page: Page,
  options: MockBackendOptions = {},
): Promise<void> {
  const contract = options.contract ?? MOCK_CONTRACT;

  await page.route(`${options.origin ?? MOCK_BACKEND}/**`, async (route: Route) => {
    if (options.failWithStatus) {
      await route.fulfill({
        status: options.failWithStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'mock failure' }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body),
      });

    if (url.pathname === '/v1/capabilities') return json(capabilities(contract));
    if (url.pathname === '/v1/sessions') {
      if (options.stress) return json({ sessions: stressFixtures().sessions });
      return json(sessions());
    }
    // The rail labels its groups from workspace root paths, so the app asks
    // for these on connect. Without the route the browser logs a 404 even
    // though the client tolerates it.
    // The rail footer shows a live agent count.
    if (url.pathname === '/v1/agents') {
      return json({
        agents: [
          { id: 'main', title: 'Main', tier: 1 },
          { id: 'geospatial', title: 'Geospatial Resolution Expert', tier: 2 },
        ],
      });
    }
    // The composer's `/` picker asks for these on connect.
    if (url.pathname === '/v1/commands') {
      return json({
        commands: [
          { id: '/clear', title: 'clear', description: 'Drop the in-memory log' },
          { id: '/compact', title: 'compact', description: 'Compact the context' },
        ],
      });
    }
    // Shapes copied from the LIVE backend, not invented: GET /v1/providers and
    // GET /v1/providers/{id}/models on clio-agent 0.9.0+42522bb1. The composer
    // reads these for its model control, and an unstubbed route here surfaces
    // as a boot console 404 rather than as a missing feature.
    if (url.pathname === '/v1/providers') {
      return json({
        providers: [
          {
            id: 'anthropic',
            name: 'Anthropic',
            auth_methods: ['api_key'],
            is_authenticated: true,
            default_model: 'claude-sonnet-4-20250514',
            api_base: '',
            env_keys: ['ANTHROPIC_API_KEY'],
            description: 'Anthropic models',
          },
          {
            id: 'openai',
            name: 'OpenAI',
            auth_methods: ['api_key'],
            is_authenticated: false,
            default_model: 'gpt-4o-mini',
            api_base: '',
            env_keys: ['OPENAI_API_KEY'],
            description: 'OpenAI models',
          },
        ],
      });
    }
    if (/^\/v1\/providers\/[^/]+\/models$/.test(url.pathname)) {
      return json({
        models: [
          {
            id: 'claude-sonnet-4-6',
            name: 'claude-sonnet-4-6',
            context_window: 200000,
            native_tool_calling: true,
            context_source: 'live',
          },
        ],
      });
    }
    if (url.pathname === '/v1/workspaces') {
      if (options.stress) return json({ workspaces: stressFixtures().workspaces });
      return json({
        workspaces: [
          {
            id: 'ws_default',
            name: 'clio-agent',
            root_path: String.raw`D:\proj\clio-agent`,
          },
        ],
      });
    }
    if (/^\/v1\/sessions\/[^/]+\/messages$/.test(url.pathname)) {
      return json({ messages: [MOCK_WIRE_MESSAGE] });
    }

    // Anything else is out of P4.R scope — answer honestly rather than
    // silently returning an empty 200 the app would misread as real data.
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `unmocked route ${url.pathname}` }),
    });
  });
}

/**
 * Refuse the brand-default backends the boot splash probes. Without this,
 * every cold boot spends 2×2.5s probing the REAL :17800 — specs then race
 * their own assertion timeouts, which is exactly the flake shape the full
 * run showed (boot specs at 4.7–5.2s each). A spec that wants the default
 * SERVED registers the mock on that origin afterwards; the later route wins.
 */
export async function refuseDefaultBackends(page: Page): Promise<void> {
  for (const origin of ['http://127.0.0.1:17800', 'http://localhost:17800']) {
    await page.route(`${origin}/**`, (route) => route.abort('connectionrefused'));
  }
}

/** Drive the connect screen all the way to a connected backend. */
export async function connectMockBackend(
  page: Page,
  options: MockBackendOptions = {},
): Promise<void> {
  await refuseDefaultBackends(page);
  await installMockBackend(page, options);
  await page.goto('/');
  await page.getByTestId('connect-url').fill(MOCK_BACKEND);
  await page.getByTestId('connect-submit').click();
}
