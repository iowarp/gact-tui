import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopConf = resolve(__dirname, '../../desktop/src-tauri/tauri.conf.json');

/** The CSP the desktop shell ships, read from its config so the test tracks it. */
function desktopCsp(): string {
  const conf = JSON.parse(readFileSync(desktopConf, 'utf8')) as {
    app: { security: { csp: string } };
  };
  return conf.app.security.csp;
}

// A 1x1 PNG: any valid image lets MapLibre finish the tile.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a map surface loads its basemap tiles under the desktop CSP', async ({ page }) => {
  const reset = await page.request.post(`${fixtureEndpoint}/__test/reset`);
  expect(reset.ok()).toBe(true);
  const seeded = await page.request.post(`${fixtureEndpoint}/__test/a2ui-map-demo`, {
    data: { enabled: true },
  });
  expect(seeded.ok()).toBe(true);

  // Tiles are answered locally so the test never depends on the internet; the
  // CSP is checked by the browser before a request reaches this handler.
  const tileRequests: string[] = [];
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    tileRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG });
  });

  // Enforce the shipped CSP the way the desktop webview does: before the app's
  // own scripts run (see attachment-upload-csp.spec.ts for why a <meta> CSP).
  await page.addInitScript(
    ({ cspValue, endpoint }) => {
      try {
        localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
      } catch {
        // Storage can be unavailable; the fixture connection is also the default.
      }
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
    },
    { cspValue: desktopCsp(), endpoint: fixtureEndpoint },
  );

  await page.goto('/');
  const map = page.getByRole('group', { name: 'Nearest EarthScope GNSS stations' });
  await expect(map).toBeVisible();

  await expect.poll(() => tileRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(map.getByText('The map tiles could not be loaded.')).toHaveCount(0);
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
  );
  expect(violations).toEqual([]);
});
