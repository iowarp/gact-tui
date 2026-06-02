// Real WebView e2e — drives the ACTUAL Tauri desktop app (WebView2) via
// tauri-driver + msedgedriver, not the pure-web Playwright shortcut. This
// is the only test that exercises clicks through the real WebView and the
// real gact_http / SSE-bridge / supervisor stack.
//
// Gated on TAURI_E2E=1 because it needs:
//   - a production-debug build at src-tauri/target/debug/clio-desktop.exe
//     (pnpm --filter @clio/desktop tauri:build:debug)
//   - msedgedriver.exe matching the installed WebView2 runtime
//     (apps/desktop/msedgedriver.exe or $MSEDGEDRIVER)
//   - tauri-driver on PATH (cargo install tauri-driver)
//   - a live clio on :17800 (the app attaches first)
//
// Run: TAURI_E2E=1 node --test tests/webview-e2e.test.mjs

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const APP = resolve(root, 'src-tauri', 'target', 'debug', 'clio-desktop.exe');
const DRIVER =
  process.env['MSEDGEDRIVER'] ?? resolve(root, 'msedgedriver.exe');
const TAURI_DRIVER =
  process.env['TAURI_DRIVER'] ??
  resolve(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '', '.cargo', 'bin', 'tauri-driver.exe');
const PORT = 4444;
const BASE = `http://127.0.0.1:${PORT}`;
const EL = 'element-6066-11e4-a52e-4f735466cecf';

const enabled =
  process.env['TAURI_E2E'] === '1' && existsSync(APP) && existsSync(DRIVER);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wd(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WD ${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

async function newSession() {
  const caps = {
    capabilities: {
      alwaysMatch: { 'tauri:options': { application: APP } },
      firstMatch: [{}],
    },
  };
  const j = await wd('POST', '/session', caps);
  return j.value.sessionId ?? j.sessionId;
}

async function findMaybe(sid, css) {
  try {
    const j = await wd('POST', `/session/${sid}/element`, {
      using: 'css selector',
      value: css,
    });
    return j.value[EL];
  } catch {
    return null;
  }
}

async function waitFor(sid, css, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = await findMaybe(sid, css);
    if (el) return el;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${css}`);
    await sleep(500);
  }
}

async function click(sid, el) {
  await wd('POST', `/session/${sid}/element/${el}/click`, {});
}

async function typeInto(sid, el, text) {
  // WebDriver's element/value sets the textarea value but does NOT reliably
  // fire the 'input' event SolidJS's controlled composer listens on, so the
  // signal never updates and the send dispatches empty. Set the value via
  // the native setter and dispatch a real InputEvent so the framework sees it.
  await wd('POST', `/session/${sid}/execute/sync`, {
    script:
      'const el = arguments[0], v = arguments[1]; el.focus();' +
      "const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');" +
      'if (d && d.set) { d.set.call(el, v); } else { el.value = v; }' +
      "el.dispatchEvent(new InputEvent('input', { bubbles: true, data: v, inputType: 'insertText' }));" +
      "el.dispatchEvent(new Event('change', { bubbles: true }));",
    args: [{ [EL]: el }, text],
  });
}

test('real WebView: permission card renders + clears through the Tauri stack', { skip: !enabled ? 'TAURI_E2E!=1 or build/driver missing' : false }, async () => {
  const driver = spawn(TAURI_DRIVER, ['--native-driver', DRIVER, '--port', String(PORT)], {
    stdio: 'inherit',
  });
  let sid;
  try {
    // Wait for tauri-driver to accept connections.
    for (let i = 0; i < 30; i++) {
      try {
        await fetch(`${BASE}/status`);
        break;
      } catch {
        await sleep(300);
      }
    }
    sid = await newSession();

    // The app boots, the supervisor attaches to :17800, the WebView loads
    // the chat shell. Generous window for boot + attach + agent-ready.
    await waitFor(sid, '[data-testid="chat-screen"], [data-testid="sessions-column"]', 30_000);

    // First-run onboarding tour (W3): on a fresh WebView2 profile the tour
    // overlays the chat — skip it so the rest of the flow can click through.
    // (Persisted, so subsequent runs on the same profile won't see it.)
    await sleep(600);
    const skipTour = await findMaybe(sid, '[data-testid="onboarding-skip"]');
    if (skipTour) {
      await click(sid, skipTour);
      await sleep(400);
    }

    // Fresh session, then a tool-using prompt → clio emits
    // permission.requested, delivered over the SSE bridge.
    const newBtn = await waitFor(sid, '[data-testid="sessions-new"]', 8_000);
    await click(sid, newBtn);
    await sleep(1_200);
    const row = await waitFor(sid, '[data-testid^="session-row-"]', 8_000);
    await click(sid, row);
    await sleep(800);

    const composer = await waitFor(sid, '[data-testid="composer-input"]', 8_000);
    await click(sid, composer);
    await typeInto(sid, composer, 'Run the shell command: echo hi > e2e_probe.txt');
    const send = await waitFor(sid, '[data-testid="composer-send"]', 4_000);
    await click(sid, send);

    // The permission card must render in the REAL WebView — proving the
    // SSE path delivers permission.requested end-to-end (the Rust bridge,
    // or the EventSource fallback when the bridge doesn't open).
    const card = await waitFor(sid, '[data-testid="permission-card"]', 60_000);
    assert.ok(card, 'permission card should render');
    // Capture the proof screenshot while the card is up.
    try {
      const png = await wd('GET', `/session/${sid}/screenshot`);
      const fs = await import('node:fs');
      fs.writeFileSync(
        resolve(root, '..', 'web', 'screenshots', 'audit', 'w1-webview-permission.png'),
        Buffer.from(png.value, 'base64'),
      );
    } catch {
      /* screenshot is best-effort proof */
    }

    // A decision must clear it.
    const deny = await waitFor(sid, '[data-testid="permcard-deny"]', 5_000);
    await click(sid, deny);
    const deadline = Date.now() + 15_000;
    let cleared = false;
    while (Date.now() < deadline) {
      if (!(await findMaybe(sid, '[data-testid="permission-card"]'))) {
        cleared = true;
        break;
      }
      await sleep(500);
    }
    assert.ok(cleared, 'permission card should clear after a decision');
  } finally {
    if (sid) {
      try {
        await wd('DELETE', `/session/${sid}`);
      } catch {
        /* ignore */
      }
    }
    driver.kill();
  }
});
