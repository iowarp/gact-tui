import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/*
 * The desktop app serves the HDF5 viewer from its own origin with its own CSP
 * (desktop/src-tauri/src/viewer_origin.rs), because h5web builds functions from
 * strings and the app's CSP forbids that. This reproduces the arrangement on the
 * real origins and policies: an app page at http://tauri.localhost under
 * tauri.conf.json's CSP frames the built viewer at http://gact-viewer.localhost
 * under the viewer's CSP. These are the Windows forms of both origins; macOS and
 * Linux use custom schemes, which Chromium cannot route.
 *
 * The app side is a minimal stand-in for Hdf5ViewerFrame, whose origin rules are
 * unit-tested. What this proves is that h5web runs under the viewer policy inside
 * the strict app, and that the message bridge works across the two origins.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const appOrigin = 'http://tauri.localhost';
const viewerOrigin = 'http://gact-viewer.localhost';
const distDir = resolve(__dirname, '../dist');

type Recording = Record<string, { status: number; contentType: string; body: string }>;

const recorded = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/hdf5/water-h5grove.json'), 'utf8'),
) as Recording;

function appCsp(): string {
  const conf = JSON.parse(
    readFileSync(resolve(__dirname, '../../desktop/src-tauri/tauri.conf.json'), 'utf8'),
  ) as { app: { security: { csp: string } } };
  return conf.app.security.csp;
}

/** VIEWER_CSP from viewer_origin.rs, with Rust's line continuations joined. */
function viewerCsp(): string {
  const source = readFileSync(
    resolve(__dirname, '../../desktop/src-tauri/src/viewer_origin.rs'),
    'utf8',
  );
  const match = /pub const VIEWER_CSP: &str = "([\s\S]*?)";/u.exec(source);
  if (!match?.[1]) throw new Error('VIEWER_CSP not found in viewer_origin.rs');
  return match[1].replace(/\\\n\s*/gu, '');
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** The app side: frame the viewer and answer it from the recording, as Hdf5ViewerFrame does. */
const hostScript = `
const viewerOrigin = ${JSON.stringify(viewerOrigin)};
const recorded = ${JSON.stringify(recorded)};
window.hostProblems = [];
const frame = document.createElement('iframe');
frame.title = 'HDF5 viewer';
frame.style.cssText = 'width: 1000px; height: 700px; border: 0';
frame.src = viewerOrigin + '/hdf5-viewer/index.html?host=' + encodeURIComponent(location.origin);
document.body.append(frame);
const post = (message, transfer = []) => frame.contentWindow.postMessage(message, viewerOrigin, transfer);
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  if (event.origin !== viewerOrigin) {
    window.hostProblems.push('message from ' + event.origin);
    return;
  }
  const message = event.data;
  if (message.type === 'ready') {
    post({ source: 'clio-hdf5-host', type: 'init', protocol: 1, filepath: 'results/water.h5', revision: 0, theme: 'light' });
  } else if (message.type === 'fetch') {
    const params = Object.entries(message.params).filter(([key]) => key !== 'file').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const key = message.endpoint + '?' + new URLSearchParams(params).toString();
    const hit = recorded[key];
    if (!hit) {
      window.hostProblems.push('no recording for ' + key);
      post({ source: 'clio-hdf5-host', type: 'response', id: message.id, ok: false, status: 404, message: 'no recording' });
      return;
    }
    const body = Uint8Array.from(atob(hit.body), (c) => c.charCodeAt(0)).buffer;
    post({ source: 'clio-hdf5-host', type: 'response', id: message.id, ok: true, body }, [body]);
  }
});
`;

test('the HDF5 viewer runs on its own origin inside the strict desktop app', async ({ page }) => {
  const evalRefusals: string[] = [];
  const otherErrors: string[] = [];
  page.on('pageerror', (error) => {
    if (/unsafe-eval/u.test(error.message)) evalRefusals.push(error.message);
    else otherErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/u.test(message.text())) {
      otherErrors.push(message.text());
    }
  });

  await page.route(`${appOrigin}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const headers = { 'content-security-policy': appCsp() };
    if (pathname === '/host.js') {
      await route.fulfill({ contentType: CONTENT_TYPES['.js'], headers, body: hostScript });
    } else {
      await route.fulfill({
        contentType: CONTENT_TYPES['.html'],
        headers,
        body: '<!doctype html><html><body><script src="/host.js"></script></body></html>',
      });
    }
  });
  await page.route(`${viewerOrigin}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (!pathname.startsWith('/hdf5-viewer/')) {
      await route.fulfill({ status: 404, body: 'Not a viewer file.' });
      return;
    }
    await route.fulfill({
      contentType: CONTENT_TYPES[extname(pathname)] ?? 'application/octet-stream',
      headers: { 'content-security-policy': viewerCsp() },
      body: readFileSync(resolve(distDir, `.${pathname}`)),
    });
  });

  await page.goto(`${appOrigin}/`);
  const viewer = page.frameLocator('iframe[title="HDF5 viewer"]');
  await expect(viewer.getByRole('tab', { name: 'NX Line' })).toBeVisible({ timeout: 15_000 });
  await expect(viewer.getByText('I (counts)').first()).toBeVisible();
  await expect(viewer.locator('canvas').first()).toBeVisible();

  expect(evalRefusals).toEqual([]);
  expect(otherErrors).toEqual([]);
  expect(
    await page.evaluate(() => (window as Window & { hostProblems?: string[] }).hostProblems),
  ).toEqual([]);
});
