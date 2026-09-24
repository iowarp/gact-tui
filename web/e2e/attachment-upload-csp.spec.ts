import { readFileSync } from 'node:fs';
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
