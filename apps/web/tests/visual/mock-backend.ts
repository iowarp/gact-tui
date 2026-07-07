import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import {
  NOW,
  capabilities,
  compactedContextState,
  contextAgentRoster,
  contextStateForScope,
  messagesForCase,
  provider,
  semanticEventsForCase,
  sessionForCase,
  type VisualCase,
} from './mock-backend-fixtures';

const MOCK_BACKEND = 'http://mock.test';

/** The real EarthScope plot PNG, served by the mock workspace file-read route so
 *  the live-trace visual test can render the actual artifact inline. */
const REAL_PLOT_PNG = readFileSync(
  resolve(import.meta.dirname, 'fixtures', 'MTA1_GNSS_timeseries_displacement.png'),
);

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
  const messages = messagesForCase(visualCase);
  const semanticEvents = semanticEventsForCase(visualCase);

  // The web transcript now reads SSE through a fetch/ReadableStream reader
  // (not `EventSource`), so the live stream is mocked by overriding
  // `window.fetch` for the `/events` URL and returning a `text/event-stream`
  // response whose body streams the semantic frames and then STAYS OPEN — the
  // same lifecycle as the old never-closing EventSource mock. Holding the
  // stream open matters: if the body ended, the reader would schedule a
  // reconnect + reconcile, re-rendering the transcript mid-test. All other
  // requests fall through to the intercepting route below.
  await page.addInitScript(
    (payload) => {
      const nativeFetch = window.fetch.bind(window);
      const encoder = new TextEncoder();
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.startsWith(payload.baseUrl) && url.includes('/events')) {
          let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller;
              for (const semantic of payload.semanticEvents) {
                const frame = {
                  type: 'semantic.event',
                  occurred_at: semantic.occurred_at ?? payload.now,
                  payload: semantic,
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
              }
              // Intentionally left open — mirrors EventSource staying connected.
            },
          });
          init?.signal?.addEventListener('abort', () => {
            try {
              streamController?.close();
            } catch {
              /* already closed */
            }
          });
          return Promise.resolve(
            new Response(stream, {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            }),
          );
        }
        return nativeFetch(input, init);
      }) as typeof window.fetch;
    },
    { baseUrl: MOCK_BACKEND, now: NOW, semanticEvents },
  );

  await page.route(`${MOCK_BACKEND}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (method === 'GET' && path === '/v1/capabilities') {
      return json(route, capabilities());
    }
    if (method === 'GET' && path === '/v1/agents') {
      return json(route, contextAgentRoster());
    }
    if (
      method === 'GET' &&
      path === `/v1/sessions/${session.id}/context/state`
    ) {
      const scope = url.searchParams.get('scope') ?? undefined;
      return json(route, contextStateForScope(session.id, scope));
    }
    if (
      method === 'POST' &&
      path === `/v1/sessions/${session.id}/context/compact`
    ) {
      const scope = url.searchParams.get('scope') ?? undefined;
      return json(route, compactedContextState(session.id, scope));
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
    // `/v1/sessions/{id}/events` is handled by the window.fetch override above
    // (it never reaches the network), so no route branch is needed here.
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
      // The real EarthScope plot artifact (an absolute output_path emitted by the
      // visualization tool) — serve the actual PNG bytes for inline rendering.
      if (requested.endsWith('MTA1_GNSS_timeseries_displacement.png')) {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          headers: { 'access-control-allow-origin': '*' },
          body: REAL_PLOT_PNG,
        });
        return;
      }
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

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}
