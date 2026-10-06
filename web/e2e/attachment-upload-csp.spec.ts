import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopSrcTauri = resolve(__dirname, '../../desktop/src-tauri');

/**
 * The real desktop CSP, with `blob:` removed from `connect-src`.
 *
 * This is deliberate, not a mistake: the point of this spec is to prove the
 * upload path never depends on the browser being allowed to `fetch()` a
 * `blob:` object URL (gact-tui root cause B) — so it must keep passing even
 * if `blob:` is ever dropped from `connect-src` again. Reading the shipped
 * config (rather than hand-writing a CSP string) keeps every other directive
 * in sync with what WebView2 really enforces.
 */
function desktopCspWithoutBlob(): string {
  const conf = JSON.parse(readFileSync(resolve(desktopSrcTauri, 'tauri.conf.json'), 'utf8')) as {
    app: { security: { csp: string } };
  };
  const csp = conf.app.security.csp;
  return csp
    .split(';')
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) =>
      directive.startsWith('connect-src')
        ? directive
            .split(/\s+/)
            .filter((token) => token !== 'blob:')
            .join(' ')
        : directive,
    )
    .join('; ');
}

test.beforeEach(async ({ page }) => {
  const reset = await page.request.post(`${fixtureEndpoint}/__test/reset`);
  expect(reset.ok()).toBe(true);
  const attachments = await page.request.post(`${fixtureEndpoint}/__test/attachments-demo`);
  expect(attachments.ok()).toBe(true);
  await page.addInitScript((endpoint) => {
    try {
      localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    } catch {
      // MCP Apps intentionally use an opaque inner origin without storage access.
    }
  }, fixtureEndpoint);
});

test('an attachment uploads under a CSP that forbids fetching blob: object URLs', async ({
  page,
}) => {
  const csp = desktopCspWithoutBlob();
  expect(csp).toMatch(/connect-src[^;]*'self'/);
  // Only connect-src drives whether `fetch()` can read a blob: URL; img-src's
  // own `blob:` (for <img> preview thumbnails) is untouched and irrelevant here.
  expect(csp.match(/connect-src[^;]*/u)?.[0]).not.toContain('blob:');

  // Enforce the CSP the same way the desktop shell's own webview does: applied
  // before the document's own scripts run. A real HTTP response header would
  // need re-fetching the navigation response through Playwright's route
  // interception, which Chromium's Private Network Access then classifies as
  // coming from a non-loopback address space — breaking every subsequent
  // loopback fetch to the fixture with an unrelated CORS/PNA error. A <meta>
  // CSP applies to the same directives we exercise here (connect-src) and is
  // enforced identically to a header, PROVIDED it lands inside <head> before
  // the app's own scripts run — confirmed against an isolated Chromium probe.
  // At addInitScript time <head> does not exist yet, so a MutationObserver
  // inserts it as head's first child the instant the parser creates <head>.
  await page.addInitScript((cspValue) => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective}: ${event.blockedURI}`,
      );
    });

    const insertMeta = () => {
      if (!document.head) return false;
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = cspValue;
      document.head.insertBefore(meta, document.head.firstChild);
      return true;
    };
    if (!insertMeta()) {
      const observer = new MutationObserver(() => {
        if (insertMeta()) observer.disconnect();
      });
      observer.observe(document.documentElement ?? document, { childList: true, subtree: true });
    }
  }, csp);

  await page.goto(workspaceUrl);

  // workspace-page.tsx used to key the composer on
  // `composer:${sessionId}:${activeProvider}:${activeModel}:${activeEffort}`,
  // remounting it whenever the active provider/model/effort resolved after
  // navigation and silently dropping any attachment (or draft) added just
  // before that — confirmed via a captured trace showing setInputFiles
  // accept a file with no create-resource request ever following and no
  // attachment node ever existing in the DOM. The composer is now keyed on
  // the session alone and reconciles provider/model/effort into its own
  // state instead (see composer.tsx's `modelSelection`/`behaviorSelection`
  // and its own failing-first test), so a single attempt is enough here —
  // no remount is left to race.
  const fileInput = page.getByLabel('Upload files').first();
  await fileInput.setInputFiles({
    name: 'evidence.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('station coverage notes'),
  });
  // "Ready" is the pipeline's overall label once both the upload and
  // (not-required) conversion stages complete — see
  // resource-availability.ts summarizeResourcePipelineStages(). The timeout
  // is generous for real upload + poll-until-ready latency, not to cover a
  // remount race.
  await expect(page.getByRole('img', { name: /Attachment status: Ready/i })).toBeVisible({
    timeout: 15_000,
  });

  const cspViolations = await page.evaluate(
    () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
  );
  expect(cspViolations).toEqual([]);
});

test('a sent image leaves the composer and opens in the common file viewer', async ({
  page,
}, testInfo) => {
  await page.request.post(`${fixtureEndpoint}/__test/mcp-v2-ui-demo`);
  const bytes = readFileSync(new URL('../tests/fixtures/gallery-sample.png', import.meta.url));
  const errors: string[] = [];
  let sent: Record<string, unknown> | undefined;
  // The shared fixture implements custody uploads, but has no message-submit
  // handler or resource-byte read. Supply those API responses in this test;
  // attachment selection, upload, submission, clearing and rendering stay real.
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      /\/resources\/res_upload_\d+\/(content|preview)$/.test(path) &&
      route.request().method() === 'GET'
    ) {
      await route.fulfill({ contentType: 'image/png', body: bytes });
    } else if (
      path === '/v1/sessions/sess_flat_ndp/messages' &&
      route.request().method() === 'POST'
    ) {
      const body = route.request().postDataJSON();
      const reference = body.parts.find((part: { type: string }) => part.type === 'resource_ref');
      expect(reference).toMatchObject({ name: 'sent-figure.png', resource_revision: '1' });
      sent = {
        id: 'message_sent_figure',
        session_id: 'sess_flat_ndp',
        role: 'user',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        blocks: [
          { id: 'sent_text', type: 'text', text: 'Describe the attached figure.' },
          {
            ...reference,
            id: 'sent_resource',
            type: 'resource',
            workspace_id: 'ws_flat_ndp',
            media_type: 'image/png',
            delivery: { representation: 'native' },
          },
        ],
      };
      await route.fulfill({
        status: 202,
        json: {
          message_id: sent.id,
          accepted_at: sent.created_at,
          delivery: body.delivery,
          state: 'pending_steer',
          effective_model: body.model,
          behavior: body.behavior,
          idempotent_replay: false,
        },
      });
    } else if (path === '/v1/sessions/sess_flat_ndp/messages') {
      const response = await route.fetch();
      const body = await response.json();
      // Keep this case focused on the accepted attachment, not the separate
      // thousand-message virtualization fixture.
      body.messages = body.messages.slice(-6);
      if (sent) body.messages.push(sent);
      await route.fulfill({ response, json: body });
    } else await route.continue();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Theme setup belongs to the app, not an opaque embedded MCP App frame.
    if (window === window.top) localStorage.setItem('theme', 'light');
  });
  await page.goto(workspaceUrl);
  const composer = page.locator('form').filter({
    has: page.getByRole('combobox', { name: /Ask .* to investigate, build, explain, or act/ }),
  });
  await page
    .getByLabel('Upload files')
    .first()
    .setInputFiles({ name: 'sent-figure.png', mimeType: 'image/png', buffer: bytes });
  await expect(
    composer.getByRole('button', { name: 'Open sent-figure.png', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `${fixtureEndpoint}/v1/workspaces/ws_flat_ndp/resources`,
      );
      const body = await response.json();
      return body.resources.find(
        (resource: { name: string }) => resource.name === 'sent-figure.png',
      )?.state;
    })
    .toBe('ready');
  const input = composer.getByRole('combobox');
  await input.fill('Describe the attached figure.');
  const accepted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/v1/sessions/sess_flat_ndp/messages',
  );
  await composer.getByRole('button', { name: 'Steer current work', exact: true }).click();
  expect((await accepted).ok()).toBe(true);
  await expect(
    composer.getByRole('button', { name: 'Open sent-figure.png', exact: true }),
  ).toHaveCount(0);
  const message = page.getByRole('log', { name: 'Conversation' });
  await expect(message.getByRole('img', { name: 'sent-figure.png', exact: true })).toBeVisible();
  await message.getByRole('button', { name: 'Open sent-figure.png', exact: true }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const toolbar = canvas.locator('[data-slot="viewer-toolbar"]');
  await expect(toolbar).toHaveCount(1);
  await expect(canvas.getByRole('img', { name: 'sent-figure.png', exact: true })).toBeVisible();
  const geometry = await toolbar.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    width: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(geometry.height).toBeLessThanOrEqual(40);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
  const download = page.waitForEvent('download');
  await toolbar.getByRole('button', { name: 'Download file', exact: true }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('sent-figure.png');
  const savedPath = await saved.path();
  expect(savedPath).not.toBeNull();
  expect(createHash('sha256').update(readFileSync(savedPath!)).digest('hex')).toBe(
    createHash('sha256').update(bytes).digest('hex'),
  );
  await page.screenshot({
    path: testInfo.outputPath('sent-image-shared-viewer.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
