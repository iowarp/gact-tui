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

  // workspace-page.tsx keys the composer on
  // `composer:${sessionId}:${activeProvider}:${activeModel}:${activeEffort}`,
  // which changes (a full remount: a fresh PromptInput, its attachment
  // state wiped) as the active provider/model/effort resolve after
  // navigation. `setInputFiles` finds and fills the hidden file input
  // immediately regardless of whether the surrounding app state — and
  // therefore this specific composer instance — is about to be torn down,
  // so an attachment added just before a remount silently vanishes with it:
  // no chip ever appears, and nothing in the UI says why (confirmed via a
  // captured trace: the file input resolves and accepts the file, but no
  // create-resource request is ever sent and no attachment node ever exists
  // in the DOM). There is no single observable signal that rules out every
  // remount, so re-attach in a loop, from a freshly-queried input each time,
  // until it actually sticks (the "Ready" chip appears) rather than once.
  //
  // The per-attempt timeout is generous (real upload + poll-until-ready
  // latency, not just a remount check) so a genuinely-in-flight upload from
  // an earlier attempt is not mistaken for a lost one and duplicated —
  // `.first()` on the final assertion is still a second line of defense if
  // an earlier attempt's upload does complete after this one gives up on it.
  await expect(async () => {
    const fileInput = page.getByLabel('Upload files').first();
    await fileInput.setInputFiles({
      name: 'evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('station coverage notes'),
    });
    // "Ready" is the pipeline's overall label once both the upload and
    // (not-required) conversion stages complete — see
    // resource-availability.ts summarizeResourcePipelineStages().
    await expect(page.getByRole('img', { name: /Attachment status: Ready/i }).first()).toBeVisible(
      { timeout: 8_000 },
    );
  }).toPass({ timeout: 30_000 });

  const cspViolations = await page.evaluate(
    () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
  );
  expect(cspViolations).toEqual([]);
});
