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
    { type: 'thinking', thinking: 'Resolving the region before staging data.', tokens: 77 },
    { type: 'text', text: 'Starting with the geospatial child.' },
    {
      type: 'expert_handoff',
      expert: 'geospatial',
      task_id: 'task_b7525159dde5',
      question: 'Resolve Los Angeles into grounded coordinates.',
    },
    { type: 'routing_decision', expert: 'data' },
    {
      type: 'tool_call',
      id: 'call_a4c19b2e',
      name: 'stage_resource',
      input: { resource: 'earthscope_stations.csv', source: 'ds2.datacollaboratory.org' },
    },
    { type: 'tool_result', content: 'staged 1,101 rows', is_error: false },
    {
      type: 'resource_link',
      uri: 'file:///staged/earthscope_stations.csv',
      name: 'earthscope_stations.csv',
    },
    { type: 'file_diff', path: 'analysis/profile.py', status: 'applied' },
    {
      type: 'mcp_app',
      uri: 'ui://ndp/station-picker',
      mime_type: 'text/html;profile=mcp-app',
    },
    { type: 'compaction', reason: 'context pressure' },
    {
      type: 'background_exit',
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
      status: 'completed',
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

  await page.route(`${MOCK_BACKEND}/**`, async (route: Route) => {
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
    if (url.pathname === '/v1/sessions') return json(sessions());
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

/** Drive the connect screen all the way to a connected backend. */
export async function connectMockBackend(
  page: Page,
  options: MockBackendOptions = {},
): Promise<void> {
  await installMockBackend(page, options);
  await page.goto('/');
  await page.getByTestId('connect-url').fill(MOCK_BACKEND);
  await page.getByTestId('connect-submit').click();
}
