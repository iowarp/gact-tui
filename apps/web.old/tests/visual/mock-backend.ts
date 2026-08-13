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
const REAL_DOCUMENT_PDF = readFileSync(
  resolve(import.meta.dirname, 'fixtures', 'evidence-brief.pdf'),
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
  const documentReviews: unknown[] = [];

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
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
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
      return json(route, capabilities(visualCase === 'documents'));
    }
    if (method === 'GET' && path === '/v1/agents') {
      return json(route, contextAgentRoster());
    }
    if (method === 'GET' && path === `/v1/sessions/${session.id}/context/state`) {
      const scope = url.searchParams.get('scope') ?? undefined;
      return json(route, contextStateForScope(session.id, scope));
    }
    if (method === 'POST' && path === `/v1/sessions/${session.id}/context/compact`) {
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
        entries:
          visualCase === 'documents'
            ? [
                { path: 'evidence-brief.md', type: 'file', size: 412 },
                { path: 'evidence-brief.pdf', type: 'file', size: REAL_DOCUMENT_PDF.length },
              ]
            : [
                { path: 'README.md', type: 'file', size: 184 },
                { path: 'analysis.py', type: 'file', size: 122 },
                { path: 'plots/validation_plot.png', type: 'file', size: 68 },
              ],
      });
    }
    if (
      visualCase === 'documents' &&
      method === 'GET' &&
      path === '/v1/workspaces/ws-demo/artifacts'
    ) {
      return json(route, {
        artifacts: [
          {
            workspace_id: 'ws-demo',
            name: 'evidence-brief.md',
            kind: 'report',
            latest_version: 2,
            head_artifact_id: 'artifact-evidence-v2',
            versions: [
              {
                artifact_id: 'artifact-evidence-v1',
                version: 1,
                sha256: '1'.repeat(64),
                created_at: '2026-07-26T12:00:00Z',
              },
              {
                artifact_id: 'artifact-evidence-v2',
                version: 2,
                sha256: '2'.repeat(64),
                created_at: '2026-07-27T12:00:00Z',
              },
            ],
          },
          {
            workspace_id: 'ws-demo',
            name: 'evidence-brief.pdf',
            kind: 'report',
            latest_version: 1,
            head_artifact_id: 'artifact-evidence-pdf-v1',
            versions: [
              {
                artifact_id: 'artifact-evidence-pdf-v1',
                version: 1,
                sha256: '25fec3695da995b1f5561a865f6223a87313199af681c5dd1a0114d425eb8853',
                created_at: '2026-07-27T12:02:00Z',
              },
            ],
          },
        ],
        count: 2,
        next_cursor: null,
      });
    }
    if (
      visualCase === 'documents' &&
      method === 'GET' &&
      path === '/v1/artifacts/artifact-evidence-pdf-v1/document'
    ) {
      return json(route, {
        artifact_id: 'artifact-evidence-pdf-v1',
        workspace_id: 'ws-demo',
        name: 'evidence-brief.pdf',
        version: 1,
        sha256: '25fec3695da995b1f5561a865f6223a87313199af681c5dd1a0114d425eb8853',
        mime_type: 'application/pdf',
        profile: 'pdf',
        content_url: `${path}/content`,
        anchors: ['pdf-quad'],
        native_open: true,
        embedded_editors: [],
        rendition_formats: [],
        provenance: {
          mechanism: 'document-rendition',
          converter: 'pandoc+typst',
          created_at: '2026-07-27T12:02:00Z',
        },
      });
    }
    if (
      visualCase === 'documents' &&
      method === 'GET' &&
      /^\/v1\/artifacts\/artifact-evidence-v[12]\/document$/.test(path)
    ) {
      const historical = path.includes('v1/document');
      return json(route, {
        artifact_id: historical ? 'artifact-evidence-v1' : 'artifact-evidence-v2',
        workspace_id: 'ws-demo',
        name: 'evidence-brief.md',
        version: historical ? 1 : 2,
        sha256: (historical ? '1' : '2').repeat(64),
        mime_type: 'text/markdown',
        profile: 'markdown',
        content_url: `${path}/content`,
        anchors: ['text-quote'],
        native_open: true,
        embedded_editors: [],
        rendition_formats: ['pdf'],
        provenance: {
          mechanism: historical ? 'tool' : 'change_feed',
          created_at: historical ? '2026-07-26T12:00:00Z' : '2026-07-27T12:00:00Z',
        },
      });
    }
    if (
      visualCase === 'documents' &&
      method === 'GET' &&
      /^\/v1\/artifacts\/artifact-evidence-v[12]\/document\/content$/.test(path)
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'text/markdown',
        headers: { 'access-control-allow-origin': '*' },
        body:
          '# Evidence brief\n\n' +
          '## Result\n\n' +
          'The observed displacement is **tentative pending quality review**.\n\n' +
          '## Evidence boundary\n\n' +
          '- Source rows: 250,000 scan-limited observations\n' +
          '- No cadence or completeness claim is made beyond the scanned rows\n',
      });
      return;
    }
    if (
      visualCase === 'documents' &&
      method === 'GET' &&
      path === '/v1/artifacts/artifact-evidence-pdf-v1/document/content'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'access-control-allow-origin': '*' },
        body: REAL_DOCUMENT_PDF,
      });
      return;
    }
    if (
      visualCase === 'documents' &&
      method === 'GET' &&
      /^\/v1\/artifacts\/artifact-evidence-(?:v[12]|pdf-v1)\/reviews$/.test(path)
    ) {
      return json(route, { reviews: documentReviews });
    }
    if (
      visualCase === 'documents' &&
      method === 'POST' &&
      path === `/v1/sessions/${session.id}/artifact-reviews`
    ) {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: 'review-evidence-1',
        session_id: session.id,
        workspace_id: 'ws-demo',
        artifact_id: input['artifact_id'],
        artifact_name:
          input['artifact_id'] === 'artifact-evidence-pdf-v1'
            ? 'evidence-brief.pdf'
            : 'evidence-brief.md',
        artifact_version: input['expected_version'],
        artifact_sha256: input['expected_sha256'],
        anchor: input['anchor'],
        text: input['text'],
        status: 'dispatched',
        native: false,
        message_id: 'message-review-1',
        created_at: '2026-07-27T12:04:00Z',
      };
      documentReviews.splice(0, documentReviews.length, created);
      return json(route, created, 202);
    }
    if (method === 'GET' && path === '/v1/workspaces/ws-demo/files/read') {
      const requested = url.searchParams.get('path') ?? '';
      // The real EarthScope plot artifact (an absolute output_path emitted by the
      // visualization tool) — serve the actual PNG bytes for inline rendering. The
      // post-#880 capture's plot tool returns `MTA1_CI_LY_30_timeseries.png`; the
      // older fixture used `MTA1_GNSS_timeseries_displacement.png`. Both map to the
      // one committed plot PNG (the mock is a test double; the bytes only need to be
      // a real raster for the inline-image render proof).
      if (
        requested.endsWith('MTA1_CI_LY_30_timeseries.png') ||
        requested.endsWith('MTA1_GNSS_timeseries_displacement.png')
      ) {
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

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}
