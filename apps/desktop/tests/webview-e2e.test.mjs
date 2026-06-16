// Real WebView e2e — drives the ACTUAL Tauri desktop app (WebView2) via
// tauri-driver + msedgedriver, not the pure-web Playwright shortcut. This
// is the only test that exercises clicks through the real WebView and the
// real gact_http / SSE-bridge / supervisor stack.
//
// Gated on TAURI_E2E=1 because it needs:
//   - a production-debug build at src-tauri/target/debug/clio-desktop{.exe}
//     (pnpm --filter @clio/desktop tauri:build:debug)
//   - a native WebDriver matching the platform WebView
//     ($TAURI_NATIVE_DRIVER or apps/desktop/msedgedriver.exe on Windows)
//   - tauri-driver on PATH (cargo install tauri-driver)
//   - a live GACT-compatible backend on :17800 (clio or emulator; the app attaches first)
//
// Optional overrides:
//   CLIO_DESKTOP_APP=/path/to/clio-desktop{.exe}
//   TAURI_DRIVER=/path/to/tauri-driver{.exe}
//   CLIO_DESKTOP_SCREENSHOT_DIR=/path/to/screenshots
//
// Run: TAURI_E2E=1 pnpm --filter @clio/desktop test:webview

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const defaultApp =
  process.platform === 'win32'
    ? resolve(root, 'src-tauri', 'target', 'debug', 'clio-desktop.exe')
    : resolve(root, 'src-tauri', 'target', 'debug', 'clio-desktop');
const APP = process.env['CLIO_DESKTOP_APP'] ?? defaultApp;
const DRIVER =
  process.env['TAURI_NATIVE_DRIVER'] ??
  process.env['MSEDGEDRIVER'] ??
  resolve(root, 'msedgedriver.exe');
const TAURI_DRIVER =
  process.env['TAURI_DRIVER'] ??
  resolve(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '', '.cargo', 'bin', 'tauri-driver.exe');
const SCREENSHOT_DIR =
  process.env['CLIO_DESKTOP_SCREENSHOT_DIR'] ??
  resolve(root, '..', 'web', 'screenshots', 'audit');
const PORT = 4444;
const BASE = `http://127.0.0.1:${PORT}`;
const EL = 'element-6066-11e4-a52e-4f735466cecf';

const enabled =
  process.env['TAURI_E2E'] === '1' &&
  existsSync(APP) &&
  existsSync(DRIVER) &&
  existsSync(TAURI_DRIVER);

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

async function execute(sid, script, args = []) {
  return wd('POST', `/session/${sid}/execute/sync`, { script, args });
}

async function typeInto(sid, el, text) {
  await wd('POST', `/session/${sid}/element/${el}/value`, {
    text,
    value: Array.from(text),
  }).catch(() => undefined);

  const typed = await waitForComposerText(sid, text, 2_500).catch(() => false);
  if (typed) return;

  // WebKit WebDriver can focus the textarea while failing to deliver
  // element/value as user input. Fall back to a DOM edit that explicitly
  // dispatches the events Solid's controlled composer listens for.
  await execute(sid,
    (
      'const el = arguments[0], v = arguments[1];' +
      'el.focus();' +
      "const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');" +
      'if (d && d.set) { d.set.call(el, v); } else { el.value = v; }' +
      "el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));" +
      "el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: v, inputType: 'insertText' }));" +
      "el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));" +
      'return el.value;'
    ),
    [{ [EL]: el }, text],
  );
  await waitForComposerText(sid, text, 5_000);
}

async function waitForComposerText(sid, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const j = await execute(
      sid,
      (
        "const ta = document.querySelector('[data-testid=\"composer-input\"]');" +
        "const send = document.querySelector('[data-testid=\"composer-send\"]');" +
        "return {" +
        "  value: ta?.value || ''," +
        "  sendDisabled: !!send?.disabled," +
        "  active: document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName || null" +
        "};"
      ),
    );
    const state = j.value ?? {};
    if (state.value === expected && !state.sendDisabled) return state;
    if (Date.now() > deadline) {
      throw new Error(`composer did not accept text: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }
}

async function markReturningUser(sid) {
  await execute(
    sid,
    (
      "window.localStorage.setItem('clio.onboarding-done.v1', '1');" +
      "document.querySelector('[data-testid=\"onboarding-skip\"]')?.click();" +
      "return document.readyState;"
    ),
  );
}

async function screenshot(sid, name) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const png = await wd('GET', `/session/${sid}/screenshot`);
  writeFileSync(resolve(SCREENSHOT_DIR, `${name}.png`), Buffer.from(png.value, 'base64'));
}

async function waitForPaintedShell(sid) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const j = await execute(
      sid,
      (
        "return new Promise((resolve) => {" +
        "  requestAnimationFrame(() => requestAnimationFrame(() => {" +
        "    const body = document.body?.innerText || '';" +
        "    resolve({" +
        "      hasRail: !!document.querySelector('[data-testid=\"left-rail\"]')," +
        "      hasComposer: !!document.querySelector('[data-testid=\"composer-input\"]')," +
        "      hasSessionRow: !!document.querySelector('[data-testid^=\"session-row-\"]')," +
        "      hasTour: !!document.querySelector('[data-testid=\"onboarding-tour\"]')," +
        "      text: body.slice(0, 500)" +
        "    });" +
        "  }));" +
        "});"
      ),
    );
    const state = j.value ?? {};
    if (state.hasRail && state.hasComposer && !state.hasTour && /GACT|CLIO|session/i.test(state.text ?? '')) {
      return state;
    }
    if (Date.now() > deadline) {
      throw new Error(`timeout waiting for painted shell: ${JSON.stringify(state)}`);
    }
    await sleep(500);
  }
}

async function sendDiagnostics(sid) {
  const j = await execute(
    sid,
    (
      "const ta = document.querySelector('[data-testid=\"composer-input\"]');" +
      "const send = document.querySelector('[data-testid=\"composer-send\"]');" +
      "const err = document.querySelector('[data-testid=\"composer-error\"]');" +
      "const toasts = Array.from(document.querySelectorAll('.toast')).map((n) => n.textContent?.trim() || '');" +
      "return {" +
      "  text: document.body?.innerText?.slice(0, 1200) || ''," +
      "  composerValue: ta?.value || ''," +
      "  composerError: err?.textContent?.trim() || ''," +
      "  sendDisabled: !!send?.disabled," +
      "  active: document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName || null," +
      "  toasts," +
      "  tauriGlobals: Object.keys(window).filter((k) => k.toLowerCase().includes('tauri')).slice(0, 20)," +
      "  permissionCard: !!document.querySelector('[data-testid=\"permission-card\"]')" +
      "};"
    ),
  );
  return j.value;
}

async function waitForPermissionOrSendFailure(sid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const card = await findMaybe(sid, '[data-testid="permission-card"]');
    if (card) return card;
    const diag = await sendDiagnostics(sid);
    if (diag.composerError || (diag.toasts ?? []).some((t) => /send failed|lm not configured|transport|error/i.test(t))) {
      throw new Error(`send failed before permission card rendered: ${JSON.stringify(diag)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`timeout waiting for [data-testid="permission-card"]; diagnostics=${JSON.stringify(diag)}`);
    }
    await sleep(500);
  }
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

    // First-run onboarding tour (W3): native CI runs with fresh WebView
    // profiles, but this proof validates the steady-state app surface, not
    // the tour. Mark the profile as returning-user and close any visible tour
    // before capturing screenshots.
    await markReturningUser(sid);
    const tour = await findMaybe(sid, '[data-testid="onboarding-tour"]');
    if (tour) {
      await execute(sid, 'window.location.reload(); return true;');
      await waitFor(sid, '[data-testid="chat-screen"], [data-testid="sessions-column"]', 30_000);
    }
    await waitForPaintedShell(sid);
    await sleep(1_000);
    await screenshot(sid, 'desktop-webview-chat');

    // A permission-triggering prompt → clio/emulator emits
    // permission.requested, delivered over the SSE bridge. The current
    // conversation-first shell allows sending directly from an empty state;
    // when a sessions inventory is visible, creating/selecting a row is only
    // a convenience and must not be required for the proof.
    const newBtn = await findMaybe(sid, '[data-testid="sessions-new"]');
    const existingRow = await findMaybe(sid, '[data-testid^="session-row-"]');
    if (existingRow) {
      await click(sid, existingRow);
      await sleep(800);
    } else if (newBtn) {
      await click(sid, newBtn);
      await sleep(1_200);
      const row = await findMaybe(sid, '[data-testid^="session-row-"]');
      if (row) {
        await click(sid, row);
        await sleep(800);
      }
    }

    const composer = await waitFor(sid, '[data-testid="composer-input"]', 8_000);
    await click(sid, composer);
    await typeInto(sid, composer, 'Run the shell command: rm -rf /tmp/scratch');
    const send = await waitFor(sid, '[data-testid="composer-send"]', 4_000);
    await execute(
      sid,
      (
        "const send = document.querySelector('[data-testid=\"composer-send\"]');" +
        "if (!send) throw new Error('missing composer-send');" +
        "if (send.disabled) throw new Error('composer-send disabled: ' + JSON.stringify({" +
        "  value: document.querySelector('[data-testid=\"composer-input\"]')?.value || ''," +
        "  text: document.body?.innerText?.slice(0, 300) || ''" +
        "}));" +
        "send.click();" +
        "return true;"
      ),
    );

    // The permission card must render in the REAL WebView — proving the
    // Rust SSE bridge delivers permission.requested end-to-end.
    const card = await waitForPermissionOrSendFailure(sid, 60_000).catch(async (err) => {
      await screenshot(sid, 'desktop-webview-after-send');
      throw err;
    });
    assert.ok(card, 'permission card should render');
    await screenshot(sid, 'desktop-webview-permission');

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
