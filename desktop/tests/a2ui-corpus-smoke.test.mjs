// Desktop JS smoke (S8 gact-tui#409 item 3): proves the exact bundle desktop
// packages (`src-tauri/tauri.conf.json`'s `build.frontendDist`) renders all
// 43 vendored A2UI examples in a real browser, without needing the native
// Tauri/Rust build. The bundle is served by a small in-process static server
// (not a spawned `vite preview`) — on Windows, killing a `shell: true`
// grandchild process leaves the real server running and the test process
// hanging (the same class of problem tests/webview-e2e.test.mjs's
// killWindowsTree exists to work around); serving it in-process avoids that
// whole failure mode instead of reimplementing it.
//
// This is deliberately narrower than tests/webview-e2e.test.mjs (gated on
// TAURI_E2E=1, a built clio-desktop{.exe}, and tauri-driver — none of which
// this test needs): that file is the only one exercising the real WebView
// and Rust IPC bridge. If a real Tauri build is unavailable, this JS-only
// smoke is what stands in for "does the packaged frontend actually render."
//
// Preconditions: `pnpm --filter @clio/workspace build` (produces web/dist)
// and Chromium available to @playwright/test (resolved from the web
// workspace's node_modules — @playwright/test is not itself a
// @clio/desktop dependency, so it is imported by its resolved file path
// rather than a bare specifier).
//
// Run: node --test tests/a2ui-corpus-smoke.test.mjs

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '..');
const webRoot = resolve(desktopRoot, '..', 'web');
const distDir = resolve(webRoot, 'dist');
const tauriConfPath = resolve(desktopRoot, 'src-tauri', 'tauri.conf.json');

const FIXTURE_PORT = 18_902;
const fixtureEndpoint = `http://127.0.0.1:${FIXTURE_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/**
 * Serves the built `distDir` with an SPA fallback to `index.html` for any
 * path that is not a real file — the same shape `vite preview` and the
 * packaged Tauri WebView both serve, for a client-routed (react-router) app.
 */
function serveDist(dir) {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      pathname = '/';
    }
    let filePath = resolve(dir, `.${pathname}`);
    if (!filePath.startsWith(dir) || !existsSync(filePath) || pathname.endsWith('/')) {
      filePath = resolve(dir, 'index.html');
    }
    const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => resolveListen(server));
  });
}

/**
 * `frontendDist` is what the Rust bundler packages into the app — resolving
 * it here (rather than hardcoding `web/dist`) proves this test exercises the
 * SAME directory desktop ships, not a directory that happens to have the
 * same name.
 */
function resolveFrontendDist() {
  const conf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
  const declared = conf.build?.frontendDist;
  assert.ok(typeof declared === 'string' && declared.length > 0, 'frontendDist must be declared');
  return resolve(dirname(tauriConfPath), declared);
}

function resolvePlaywright() {
  // @playwright/test is a devDependency of the web workspace, not of
  // @clio/desktop — resolved by file path (pnpm's isolated node_modules
  // would not resolve the bare specifier from here) rather than declaring a
  // second copy just for this smoke.
  const require = createRequire(resolve(webRoot, 'package.json'));
  try {
    return require.resolve('@playwright/test');
  } catch {
    return null;
  }
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    let lastError = 'no response';
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
        if (response.ok || response.status < 500) return;
        lastError = `status ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await sleep(300);
    }
    throw new Error(`timed out waiting for ${url}: ${lastError}`);
  })();
}

function spawnAndCapture(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  child.stdout?.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr?.on('data', (chunk) => output.push(chunk.toString()));
  return { child, output };
}

/** Directly spawned (no shell), so a plain kill() reliably reaches it — see the file header. */
async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit())),
    sleep(3_000),
  ]);
}

const frontendDist = resolveFrontendDist();
const playwrightEntry = resolvePlaywright();
const missing = [];
if (frontendDist !== distDir) {
  missing.push(`frontendDist resolved to ${frontendDist}, expected ${distDir}`);
}
if (!existsSync(distDir) || !existsSync(resolve(distDir, 'index.html'))) {
  missing.push(`no built bundle at ${distDir} (run: pnpm --filter @clio/workspace build)`);
}
if (!playwrightEntry) {
  missing.push('@playwright/test is not resolvable from the web workspace');
}
const enabled = missing.length === 0;

test(
  'the packaged frontend bundle renders all 43 A2UI examples',
  { skip: !enabled ? `missing: ${missing.join('; ')}` : false, timeout: 120_000 },
  async () => {
    const { chromium } = (await import(pathToFileURL(playwrightEntry).href)).default;

    const fixture = spawnAndCapture('node', ['e2e/fixture-server.mjs'], {
      cwd: webRoot,
      env: { ...process.env, CLIO_FIXTURE_PORT: String(FIXTURE_PORT) },
    });
    const distServer = await serveDist(distDir);
    const { port: previewPort } = distServer.address();
    const previewEndpoint = `http://127.0.0.1:${previewPort}`;
    const workspaceUrl = `${previewEndpoint}/workspaces/ws_flat_ndp/sessions/sess_flat_ndp`;

    let browser;
    try {
      await waitForHttp(`${fixtureEndpoint}/__test/mcp-v2-ui-state`, 15_000);

      const resetResponse = await fetch(`${fixtureEndpoint}/__test/reset`, { method: 'POST' });
      assert.ok(resetResponse.ok, 'fixture reset must succeed');

      browser = await chromium.launch();
      const context = await browser.newContext();
      await context.addInitScript((endpoint) => {
        try {
          localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
        } catch {
          // Storage may be unavailable in some contexts; the app falls back
          // to its own connection picker, which this smoke does not need.
        }
      }, fixtureEndpoint);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
          consoleErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => consoleErrors.push(error.message));

      await page.goto(workspaceUrl);
      await page.getByRole('heading', { name: 'EarthScope NDP evidence review' }).waitFor({
        state: 'visible',
        timeout: 20_000,
      });
      await page.getByText('Live', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });

      const corpusResponse = await fetch(`${fixtureEndpoint}/__test/a2ui-corpus`, {
        method: 'POST',
      });
      assert.ok(corpusResponse.ok, 'publishing the 43-example corpus must succeed');
      const corpus = await corpusResponse.json();
      assert.equal(corpus.count, 43, 'the fixture must publish all 43 vendored examples');

      const conversation = page.getByRole('log', { name: 'Conversation' });
      await conversation.waitFor({ state: 'visible', timeout: 15_000 });

      // Scroll in steps (rather than straight to the bottom) so every
      // surface passes near the viewport at least once — the detached
      // surface host defers mounting to an IntersectionObserver
      // (DeferredA2UISurface, 800px rootMargin) and un-mounts again once a
      // non-live surface scrolls back out, so only a straight-to-bottom
      // jump would miss the surfaces stacked above the final scroll
      // position. Renders accumulate into a Set across every step.
      const renderedIds = new Set();
      const scrollHeight = await conversation.evaluate((element) => element.scrollHeight);
      const clientHeight = await conversation.evaluate((element) => element.clientHeight);
      const step = Math.max(200, Math.floor(clientHeight * 0.6));
      for (let top = 0; top <= scrollHeight; top += step) {
        await conversation.evaluate((element, scrollTop) => element.scrollTo({ top: scrollTop }), top);
        await page.waitForTimeout(120);
        const ids = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[aria-label^="Generated UI,"]')).map(
            (el) => el.id,
          ),
        );
        for (const id of ids) renderedIds.add(id);
      }
      // One final pass at the bottom, in case the loop's step overshot it.
      await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await page.waitForTimeout(200);
      for (const id of await page.evaluate(() =>
        Array.from(document.querySelectorAll('[aria-label^="Generated UI,"]')).map((el) => el.id),
      )) {
        renderedIds.add(id);
      }

      assert.equal(
        renderedIds.size,
        43,
        `expected 43 rendered surfaces, saw ${renderedIds.size}: ${[...renderedIds].sort().join(', ')}`,
      );

      const bodyText = await page.evaluate(() => document.body.innerText);
      assert.doesNotMatch(bodyText, /Unknown component/u, 'no example should hit an unknown-type notice');
      assert.doesNotMatch(
        bodyText,
        /Interactive surface unavailable/u,
        'no example should fail to render',
      );
      assert.deepEqual(consoleErrors, [], 'no unexpected console/page errors while rendering the corpus');
    } finally {
      await browser?.close();
      await new Promise((resolveClose) => distServer.close(resolveClose));
      await terminate(fixture.child);
    }
  },
);
