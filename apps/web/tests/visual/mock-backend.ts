import type { Page, Route } from '@playwright/test';
import type { Capabilities, Message, SemanticEventPayload, Session } from '@clio/core';

const MOCK_BACKEND = 'http://mock.test';
const NOW = '2026-06-16T12:00:00Z';

const markdownMessages: Message[] = [
  {
    id: 'm-md-user',
    session_id: 'mock-markdown',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [{ type: 'text', text: 'Read docs/release.md and summarize the readiness checklist.' }],
  },
  {
    id: 'm-md-asst',
    session_id: 'mock-markdown',
    role: 'assistant',
    created_at: '2026-06-16T12:00:03Z',
    parts: [
      {
        type: 'tool_call',
        call_id: 'tc-read-md',
        tool_name: 'ReadFile',
        input: { path: 'docs/release.md' },
      },
      {
        type: 'text',
        text:
          '# Release Readiness\n\n' +
          '| Area | Status | Owner |\n' +
          '| --- | --- | --- |\n' +
          '| Rendering pipeline | Ready | TUI |\n' +
          '| Markdown preview | Ready | Web |\n' +
          '| CLIO live benchmark | Waiting on backend | CLIO |\n\n' +
          '- The rendering rewrite is in place.\n' +
          '- Diffs open in the review rail instead of a raw blob.\n' +
          '- Streaming proof still depends on the live provider path.\n\n' +
          '```bash\n' +
          'pnpm test:visual -- tests/visual/screenshots.spec.ts\n' +
          '```',
      },
    ],
  },
];

const earthscopeMessages: Message[] = [
  {
    id: 'm-earth-user',
    session_id: 'mock-earthscope',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [
      {
        type: 'text',
        text:
          "What recent ground-motion is EarthScope's GNSS network showing around Los Angeles? Pull a real station's time series, plot it, and tell me how much to trust the data.",
      },
    ],
  },
  {
    id: 'm-earth-asst',
    session_id: 'mock-earthscope',
    role: 'assistant',
    created_at: '2026-06-16T12:00:04Z',
    parts: [
      {
        type: 'tool_call',
        call_id: 'tc-geo',
        tool_name: 'ResolveRegion',
        input: { location: 'Los Angeles, CA', radius_km: 50 },
      },
      {
        type: 'tool_result',
        call_id: 'tc-geo',
        output: 'Resolved Los Angeles, CA; center 34.0522, -118.2437; radius 50 km; confidence high.',
        duration_ms: 2025,
      },
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'main',
          agent_id: 'geospatial',
          status: 'completed',
          output_summary:
            JSON.stringify({
              REGION_LABEL: 'Los Angeles',
              CENTER_LAT: 34.0522,
              CENTER_LON: -118.2437,
              RADIUS_KM: 50,
              CONFIDENCE: 'high',
            }) +
            '\n\nCLIO durable typed workflow state:\n' +
            JSON.stringify({
              workflow_state: {
                geospatial: {
                  status: 'resolved',
                  region_name: 'Los Angeles',
                  confidence: 'high',
                },
              },
            }),
        },
      },
      {
        type: 'tool_call',
        call_id: 'tc-stations',
        tool_name: 'EarthScopeStationCatalog',
        input: { network: 'GNSS', bbox: [33.7, -118.67, 34.34, -117.9] },
      },
      {
        type: 'text',
        text:
          'The workflow selected **MTA1** as the nearest station and kept nearby stations as context.\n\n' +
          'Ranked EarthScope GNSS stations | Rank | Station | Distance km | Note | | ---: | --- | ---: | --- | | 1 | MTA1 | 0.37 | selected | | 2 | PKRD | 2.37 | corroboration | | 3 | ELSC | 4.10 | corroboration |\n\n' +
          'Trust is **moderate** until the time-series plot and station health metadata are both present.\n\n' +
          'CLIO typed workflow state:\n' +
          JSON.stringify({
            workflow_state: {
              geospatial: {
                status: 'resolved',
                region_name: 'Los Angeles',
                confidence: 'high',
              },
              station_catalog: {
                status: 'ranked',
                candidate_count: 72,
              },
              artifact: {
                status: 'ready',
                path: '/tmp/grind-es-demo/MTA1_plot.png',
              },
            },
          }),
      },
    ],
  },
];

const earthscopeBlockedMessages: Message[] = [
  {
    id: 'm-earth-blocked-user',
    session_id: 'mock-earthscope-blocked',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [
      {
        type: 'text',
        text: 'Explore recent seismic/geodetic activity around the San Diego area and stage EarthScope/NDP GNSS evidence.',
      },
    ],
  },
  {
    id: 'm-earth-blocked-asst',
    session_id: 'mock-earthscope-blocked',
    role: 'assistant',
    created_at: '2026-06-16T12:00:04Z',
    stop_reason: 'end_turn',
    parts: [
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'main',
          agent_id: 'geospatial',
          status: 'completed',
          output_summary:
            JSON.stringify({
              REGION_LABEL: 'San Diego area',
              CENTER_LAT: 32.7157,
              CENTER_LON: -117.1611,
              RADIUS_KM: 50,
              CONFIDENCE: 'high',
            }) +
            '\n\nCLIO durable typed workflow state:\n' +
            JSON.stringify({
              workflow_state: {
                geospatial: {
                  status: 'resolved',
                  region_name: 'San Diego area',
                  confidence: 'high',
                },
              },
            }),
        },
      },
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'data',
          agent_id: 'ndp_dataset_discovery',
          status: 'failed',
          output_summary:
            "Child expert 'ndp_dataset_discovery' failed while delegated from 'data': _UnsupportedSessionAgent. ndp_dataset_discovery\n\n" +
            'CLIO durable typed workflow state:\n' +
            JSON.stringify({
              workflow_state: {
                geospatial: {
                  status: 'resolved',
                  region_name: 'San Diego area',
                  confidence: 'high',
                },
                delegation: {
                  status: 'failed',
                  failed_child: 'ndp_dataset_discovery',
                  parent: 'data',
                  error: '_UnsupportedSessionAgent',
                  message: 'ndp_dataset_discovery',
                },
                acquisition: {
                  analysis_ready: false,
                },
              },
            }),
        },
      },
      {
        type: 'text',
        text:
          'The San Diego region was resolved, but the downstream NDP discovery expert could not start because the required tools were not available in this session. No station time-series, CSV profile, or PNG artifact was produced.',
      },
    ],
  },
];

const earthscopeEvents: SemanticEventPayload[] = [
  {
    event_id: 'se-1',
    event_type: 'agent.invocation.started',
    status: 'running',
    summary: 'main started the EarthScope GNSS workflow.',
    turn_id: 'turn-earthscope-1',
    occurred_at: '2026-06-16T12:00:01Z',
  },
  {
    event_id: 'se-2',
    event_type: 'blueprint.delegation.started',
    status: 'running',
    summary: 'main handed region resolution to geospatial.',
    turn_id: 'turn-earthscope-1',
    occurred_at: '2026-06-16T12:00:02Z',
  },
  {
    event_id: 'se-3',
    event_type: 'blueprint.delegation.completed',
    status: 'completed',
    summary: 'geospatial returned Los Angeles bounds.',
    turn_id: 'turn-earthscope-1',
    occurred_at: '2026-06-16T12:00:04Z',
  },
  {
    event_id: 'se-4',
    event_type: 'blueprint.delegation.started',
    status: 'running',
    summary: 'data handed station discovery to earthscope_catalog.',
    turn_id: 'turn-earthscope-1',
    occurred_at: '2026-06-16T12:00:05Z',
  },
  {
    event_id: 'se-5',
    event_type: 'blueprint.delegation.completed',
    status: 'completed',
    summary: 'earthscope_catalog ranked nearby GNSS stations.',
    turn_id: 'turn-earthscope-1',
    occurred_at: '2026-06-16T12:00:10Z',
  },
];

type VisualCase = 'markdown' | 'earthscope' | 'earthscope-blocked';

export async function connectMockBackend(page: Page, visualCase: VisualCase): Promise<void> {
  const session = sessionForCase(visualCase);
  await installMockBackend(page, visualCase);
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(MOCK_BACKEND);
  await page.getByTestId('connect-submit').click();
  await page.getByTestId(`session-row-${session.id}`).click();
}

async function installMockBackend(page: Page, visualCase: VisualCase): Promise<void> {
  const session = sessionForCase(visualCase);
  const messages =
    visualCase === 'markdown'
      ? markdownMessages
      : visualCase === 'earthscope-blocked'
        ? earthscopeBlockedMessages
        : earthscopeMessages;
  const semanticEvents = visualCase === 'earthscope' ? earthscopeEvents : [];

  await page.addInitScript((payload) => {
    const NativeEventSource = window.EventSource;

    class MockEventSource extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;

      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSED = 2;
      readonly url: string;
      readonly withCredentials = false;
      readyState = MockEventSource.CONNECTING;
      onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
      onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
      onerror: ((this: EventSource, ev: Event) => unknown) | null = null;

      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super();
        this.url = String(url);
        if (!this.url.startsWith(payload.baseUrl)) {
          return new NativeEventSource(url, eventSourceInitDict) as unknown as MockEventSource;
        }
        window.setTimeout(() => {
          if (this.readyState === MockEventSource.CLOSED) return;
          this.readyState = MockEventSource.OPEN;
          const open = new Event('open');
          this.dispatchEvent(open);
          this.onopen?.call(this as unknown as EventSource, open);
          for (const semantic of payload.semanticEvents) {
            const frame = {
              type: 'semantic.event',
              occurred_at: semantic.occurred_at ?? payload.now,
              payload: semantic,
            };
            const ev = new MessageEvent('semantic.event', {
              data: JSON.stringify(frame),
            });
            this.dispatchEvent(ev);
          }
        }, 50);
      }

      close() {
        this.readyState = MockEventSource.CLOSED;
      }
    }

    window.EventSource = MockEventSource as unknown as typeof EventSource;
  }, { baseUrl: MOCK_BACKEND, now: NOW, semanticEvents });

  await page.route(`${MOCK_BACKEND}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (method === 'GET' && path === '/v1/capabilities') {
      return json(route, capabilities());
    }
    if (method === 'GET' && path === '/v1/sessions') {
      return json(route, { sessions: [session] });
    }
    if (method === 'GET' && path === `/v1/sessions/${session.id}`) {
      return json(route, session);
    }
    if (method === 'GET' && path === `/v1/sessions/${session.id}/messages`) {
      return json(route, { messages });
    }
    if (method === 'GET' && path === `/v1/sessions/${session.id}/events`) {
      return json(route, {});
    }
    if (method === 'GET' && path === '/v1/workspaces') {
      return json(route, {
        workspaces: [{ id: 'ws-demo', name: 'NDP demo', root_path: '/tmp/ndp-demo' }],
      });
    }
    if (method === 'GET' && path === '/v1/workspaces/ws-demo/files') {
      return json(route, {
        entries: [
          { path: 'README.md', type: 'file', size: 184 },
          { path: 'analysis.py', type: 'file', size: 122 },
          { path: 'plots/validation_plot.png', type: 'file', size: 68 },
        ],
      });
    }
    if (method === 'GET' && path === '/v1/workspaces/ws-demo/files/read') {
      const requested = url.searchParams.get('path') ?? '';
      if (requested === 'plots/validation_plot.png') {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ error: 'backend returned JSON instead of raw PNG bytes' }),
        });
        return;
      }
      if (requested === 'README.md') {
        await route.fulfill({
          status: 200,
          contentType: 'text/markdown',
          headers: { 'access-control-allow-origin': '*' },
          body: '# Evidence Checklist\n\n- Markdown preview renders.\n',
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/x-python',
        headers: { 'access-control-allow-origin': '*' },
        body: 'def analyze():\n    return "ok"\n',
      });
      return;
    }
    if (method === 'GET' && path === '/v1/providers') {
      return json(route, { providers: [provider()] });
    }
    if (method === 'GET' && path === '/v1/providers/lm') {
      return json(route, {
        configured: true,
        provider: 'argonne_sophia',
        api_base: 'https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1',
        model: 'openai/gpt-oss-120b',
        temperature: 0.2,
        max_tokens: 32000,
      });
    }
    if (method === 'GET' && path === '/v1/commands') {
      return json(route, { commands: [] });
    }
    if (method === 'GET' && path === '/v1/permissions') {
      return json(route, { permissions: [] });
    }
    if (method === 'GET' && path.endsWith('/questions')) {
      return json(route, { questions: [] });
    }
    if (method === 'GET' && path.endsWith('/context/files')) {
      return json(route, { files: [] });
    }
    if (method === 'GET' && path.endsWith('/context/frames')) {
      return json(route, { frames: [] });
    }
    if (method === 'GET' && path.endsWith('/diffs')) {
      return json(route, { diffs: [] });
    }
    if (method === 'GET' && path.endsWith('/schedules')) {
      return json(route, { schedules: [] });
    }
    if (method === 'GET' && path.endsWith('/attempts')) {
      return json(route, { attempts: [] });
    }
    if (method === 'GET' && path.endsWith('/agent-blueprint')) {
      return json(route, {});
    }
    if (method === 'GET' && path.endsWith('/expert-pack')) {
      return json(route, {});
    }
    if (method === 'GET' && path === '/v1/agent-blueprints') {
      return json(route, { blueprints: [] });
    }
    if (method === 'GET' && path === '/v1/expert-packs') {
      return json(route, { packs: [] });
    }

    return json(route, {});
  });
}

function sessionForCase(visualCase: VisualCase): Session {
  return {
    id:
      visualCase === 'markdown'
        ? 'mock-markdown'
        : visualCase === 'earthscope-blocked'
          ? 'mock-earthscope-blocked'
          : 'mock-earthscope',
    title:
      visualCase === 'markdown'
        ? 'markdown release read'
        : visualCase === 'earthscope-blocked'
          ? 'earthscope ndp blocked'
        : 'earthscope gnss los angeles',
    status: 'finished',
    workspace_id: 'ws-demo',
    created_at: NOW,
    updated_at: NOW,
    message_count: 2,
    mode: 'chat',
    edit_mode: 'diff',
    routing_mode: 'auto',
  };
}

function capabilities(): Capabilities {
  return {
    contract_version: '0.2',
    backend: { name: 'mock-clio', version: '0.0.0', vendor: 'gact-tui' },
    capabilities: {
      workspaces: true,
      sessions: true,
      files: true,
      diffs: true,
      permissions: true,
      providers: true,
      commands: true,
      metrics: true,
      agent_routing: true,
      thinking_blocks: true,
      structured_errors: true,
      tool_telemetry: true,
      x_clio_semantic_events: true,
    },
    transports: { events_sse: true, events_websocket: false },
    auth: { schemes: ['trust_socket'], current: 'trust_socket' },
    extensions: [],
  };
}

function provider() {
  return {
    id: 'argonne_sophia',
    name: 'ALCF Sophia',
    is_authenticated: true,
    default_model: 'openai/gpt-oss-120b',
    api_base: 'https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1',
    description: 'Mocked ALCF provider for visual proof.',
  };
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}
