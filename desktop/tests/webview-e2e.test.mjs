// Real WebView e2e — drives the ACTUAL Tauri desktop app (WebView2) via
// tauri-driver + msedgedriver, not the pure-web Playwright shortcut. This
// is the only test that exercises clicks through the real WebView and the
// real gact_http / SSE-bridge / supervisor stack.
//
// Gated on TAURI_E2E=1 because it needs:
//   - a production-debug build at src-tauri/target/debug/clio-desktop{.exe}
//     (pnpm --filter @clio/desktop tauri:build:debug)
//   - a native WebDriver matching the platform WebView
//     ($TAURI_NATIVE_DRIVER or desktop/msedgedriver.exe on Windows)
//   - tauri-driver on PATH (cargo install tauri-driver)
//   - a live GACT-compatible backend on :17800 (the app attaches first)
//
// Optional overrides:
//   CLIO_DESKTOP_APP=/path/to/clio-desktop{.exe}
//   TAURI_DRIVER=/path/to/tauri-driver{.exe}
//   TAURI_NATIVE_DRIVER=/path/to/WebKitWebDriver or msedgedriver.exe
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
function findOnPath(name) {
  for (const dir of (process.env['PATH'] ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue;
    const candidate = resolve(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function firstExisting(paths) {
  return paths.find((candidate) => candidate && existsSync(candidate)) ?? '';
}

const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
const defaultNativeDriver =
  process.platform === 'win32'
    ? resolve(root, 'msedgedriver.exe')
    : firstExisting([
        findOnPath('WebKitWebDriver'),
        findOnPath('webkit2gtk-driver'),
        resolve(
          root,
          '..',
          '..',
          'tmp',
          'webkit-driver-local',
          'root',
          'usr',
          'bin',
          'WebKitWebDriver',
        ),
      ]);
const defaultTauriDriver =
  process.platform === 'win32'
    ? resolve(home, '.cargo', 'bin', 'tauri-driver.exe')
    : (findOnPath('tauri-driver') ?? resolve(home, '.cargo', 'bin', 'tauri-driver'));
const APP = process.env['CLIO_DESKTOP_APP'] ?? defaultApp;
const DRIVER =
  process.env['TAURI_NATIVE_DRIVER'] ?? process.env['MSEDGEDRIVER'] ?? defaultNativeDriver;
const TAURI_DRIVER = process.env['TAURI_DRIVER'] ?? defaultTauriDriver;
const SCREENSHOT_DIR =
  process.env['CLIO_DESKTOP_SCREENSHOT_DIR'] ?? resolve(root, '..', 'web', 'screenshots', 'audit');
const CHAT_ONLY = process.env['TAURI_E2E_CHAT_ONLY'] === '1';
const BACKEND_URL = process.env['CLIO_DESKTOP_BACKEND_URL'] ?? 'http://127.0.0.1:17800';
const WORKSPACE_ID = process.env['CLIO_DESKTOP_WORKSPACE_ID'] ?? 'ws_default';
const PORT = 4444;
const BASE = `http://127.0.0.1:${PORT}`;
const EL = 'element-6066-11e4-a52e-4f735466cecf';
const SHELL_SELECTOR =
  'section[aria-label="Session workspace"], nav[aria-label="Workspace navigation"]';
const COMPOSER_SELECTOR = 'textarea[name="message"]';
const SUBMIT_SELECTOR = 'button[aria-label="Submit"]';
const RESPONSE_SELECTOR = 'section[aria-label="Agent needs your response"]';

// The native app's supervisor attaches through CLIO_GACT_URL / CLIO_PORT.
// Keep the WebView test's backend fixture URL and the launched app's attach
// target in lockstep so the test never seeds one backend and inspects another.
if (!process.env['CLIO_GACT_URL']) {
  process.env['CLIO_GACT_URL'] = BACKEND_URL;
}
if (!process.env['CLIO_PORT']) {
  try {
    const parsed = new URL(BACKEND_URL);
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      process.env['CLIO_PORT'] = parsed.port;
    }
  } catch {
    // BACKEND_URL validation happens when the API calls run.
  }
}

const missing = [];
if (process.env['TAURI_E2E'] !== '1') missing.push('TAURI_E2E=1');
if (!existsSync(APP)) missing.push(`desktop app: ${APP}`);
if (!DRIVER || !existsSync(DRIVER)) missing.push('native WebDriver');
if (!existsSync(TAURI_DRIVER)) missing.push(`tauri-driver: ${TAURI_DRIVER}`);
const enabled = missing.length === 0;

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

async function api(method, path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`API ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function seedPermissionProbeSession() {
  const stamp = Date.now();
  const agentId = `desktop_permission_probe_${stamp}`;
  await api('POST', '/v1/agents', {
    id: agentId,
    title: 'Desktop Permission Probe',
    description: 'Calls shell_bash for native WebView permission validation.',
    system_prompt: [
      'You validate the desktop UI permission surface.',
      'When the user asks to run a shell command, call shell_bash with that command.',
      'Do not refuse ordinary shell validation prompts.',
      'Do not summarize before calling the tool.',
    ].join(' '),
    tools: ['shell_bash'],
    tier: 1,
    specialization: 'desktop_permission_validation',
    keywords: ['desktop', 'permission', 'shell'],
  });
  const session = await api('POST', '/v1/sessions', {
    title: `desktop permission ${stamp}`,
    workspace_id: WORKSPACE_ID,
    routing_mode: 'chat',
    agent: { id: agentId },
  });
  return { agentId, sessionId: session.id };
}

async function cleanupPermissionProbe(agentId, sessionId) {
  if (sessionId) {
    await api('PATCH', `/v1/sessions/${encodeURIComponent(sessionId)}`, {
      archived: true,
    }).catch(() => undefined);
  }
  if (agentId) {
    await api('DELETE', `/v1/agents/${encodeURIComponent(agentId)}`).catch(() => undefined);
  }
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
  await execute(
    sid,
    'const el = arguments[0], v = arguments[1];' +
      'el.focus();' +
      "const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');" +
      'if (d && d.set) { d.set.call(el, v); } else { el.value = v; }' +
      "el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));" +
      "el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: v, inputType: 'insertText' }));" +
      "el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));" +
      'return el.value;',
    [{ [EL]: el }, text],
  );
  await waitForComposerText(sid, text, 5_000);
}

async function waitForComposerText(sid, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const j = await execute(
      sid,
      `const ta = document.querySelector('${COMPOSER_SELECTOR}');` +
        `const send = document.querySelector('${SUBMIT_SELECTOR}');` +
        'return {' +
        "  value: ta?.value || ''," +
        '  sendDisabled: !!send?.disabled,' +
        "  active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || null" +
        '};',
    );
    const state = j.value ?? {};
    if (state.value === expected && !state.sendDisabled) return state;
    if (Date.now() > deadline) {
      throw new Error(`composer did not accept text: ${JSON.stringify(state)}`);
    }
    await sleep(200);
  }
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
      'return new Promise((resolve) => {' +
        '  requestAnimationFrame(() => requestAnimationFrame(() => {' +
        "    const body = document.body?.innerText || '';" +
        '    resolve({' +
        '      hasSessionWorkspace: !!document.querySelector(\'section[aria-label="Session workspace"]\'),' +
        '      hasNavigation: !!document.querySelector(\'nav[aria-label="Workspace navigation"]\'),' +
        `      hasComposer: !!document.querySelector('${COMPOSER_SELECTOR}'),` +
        '      text: body.slice(0, 500)' +
        '    });' +
        '  }));' +
        '});',
    );
    const state = j.value ?? {};
    if (
      (state.hasSessionWorkspace || state.hasNavigation) &&
      state.hasComposer &&
      /GACT|CLIO|session/i.test(state.text ?? '')
    ) {
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
    `const ta = document.querySelector('${COMPOSER_SELECTOR}');` +
      `const send = document.querySelector('${SUBMIT_SELECTOR}');` +
      "const toasts = Array.from(document.querySelectorAll('.toast')).map((n) => n.textContent?.trim() || '');" +
      'return {' +
      "  text: document.body?.innerText?.slice(0, 1200) || ''," +
      "  composerValue: ta?.value || ''," +
      '  sendDisabled: !!send?.disabled,' +
      "  active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || null," +
      '  toasts,' +
      '  isTauri: window.isTauri === true,' +
      "  hasTauriGlobal: typeof window.__TAURI__ !== 'undefined'," +
      "  hasTauriInternals: typeof window.__TAURI_INTERNALS__ !== 'undefined'," +
      '  locationOrigin: window.location.origin,' +
      '  sseDebug: window.__gactSseDebug || null,' +
      "  tauriGlobals: Object.keys(window).filter((k) => k.toLowerCase().includes('tauri')).slice(0, 20)," +
      `  permissionCard: !!document.querySelector('${RESPONSE_SELECTOR}')` +
      '};',
  );
  return j.value;
}

async function waitForPermissionOrSendFailure(sid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const card = await findMaybe(sid, RESPONSE_SELECTOR);
    if (card) return card;
    const diag = await sendDiagnostics(sid);
    if ((diag.toasts ?? []).some((t) => /send failed|lm not configured|transport|error/i.test(t))) {
      throw new Error(`send failed before permission card rendered: ${JSON.stringify(diag)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timeout waiting for ${RESPONSE_SELECTOR}; diagnostics=${JSON.stringify(diag)}`,
      );
    }
    await sleep(500);
  }
}

async function waitForVisiblePermissionCard(sid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const j = await execute(
      sid,
      `const card = document.querySelector('${RESPONSE_SELECTOR}');` +
        "if (card) card.scrollIntoView({ block: 'center', inline: 'nearest' });" +
        'const r = card?.getBoundingClientRect();' +
        "const text = card?.textContent?.trim() || '';" +
        'return {' +
        '  present: !!card,' +
        '  text,' +
        '  rect: r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null,' +
        '  visible: !!r && r.width > 80 && r.height > 80 && r.bottom > 0 && r.top < window.innerHeight' +
        '};',
    );
    const state = j.value ?? {};
    if (state.visible && /permission/i.test(state.text ?? '')) return state;
    if (Date.now() > deadline) {
      throw new Error(`permission card present but not visibly rendered: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }
}

test(
  'real WebView: permission card renders + clears through the Tauri stack',
  { skip: !enabled ? `missing ${missing.join(', ')}` : false },
  async () => {
    const seeded = CHAT_ONLY ? { agentId: '', sessionId: '' } : await seedPermissionProbeSession();
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
      await waitFor(sid, SHELL_SELECTOR, 30_000);

      await waitForPaintedShell(sid);
      await sleep(1_000);
      await screenshot(sid, 'desktop-webview-chat');

      if (CHAT_ONLY) return;

      // A permission-triggering prompt makes CLIO emit permission.requested,
      // delivered over the SSE bridge. Rather than relying on the default
      // orchestrator to have shell access,
      // seed a disposable shell-capable validation agent/session through the
      // real backend and select that session in the native WebView.
      const seededRow = await waitFor(sid, `a[href$="/sessions/${seeded.sessionId}"]`, 15_000);
      await click(sid, seededRow);
      await sleep(800);

      const composer = await waitFor(sid, COMPOSER_SELECTOR, 8_000);
      await click(sid, composer);
      await typeInto(
        sid,
        composer,
        'Run this shell command exactly: rm -rf /tmp/gact-desktop-permission-probe-do-not-exist',
      );
      const send = await waitFor(sid, SUBMIT_SELECTOR, 4_000);
      await execute(
        sid,
        `const send = document.querySelector('${SUBMIT_SELECTOR}');` +
          "if (!send) throw new Error('missing composer-send');" +
          "if (send.disabled) throw new Error('composer-send disabled: ' + JSON.stringify({" +
          `  value: document.querySelector('${COMPOSER_SELECTOR}')?.value || '',` +
          "  text: document.body?.innerText?.slice(0, 300) || ''" +
          '}));' +
          'send.click();' +
          'return true;',
      );

      // The permission card must render in the REAL WebView — proving the
      // Rust SSE bridge delivers permission.requested end-to-end.
      const card = await waitForPermissionOrSendFailure(sid, 60_000).catch(async (err) => {
        await screenshot(sid, 'desktop-webview-after-send');
        throw err;
      });
      assert.ok(card, 'permission card should render');
      await waitForVisiblePermissionCard(sid, 5_000);
      await sleep(250);
      await screenshot(sid, 'desktop-webview-permission');

      // A decision must clear it.
      await execute(
        sid,
        `const section = document.querySelector('${RESPONSE_SELECTOR}');` +
          "const deny = Array.from(section?.querySelectorAll('button') || []).find((button) => button.textContent?.trim() === 'Deny');" +
          "if (!deny) throw new Error('missing Deny action');" +
          'deny.click();' +
          'return true;',
      );
      const deadline = Date.now() + 15_000;
      let cleared = false;
      while (Date.now() < deadline) {
        if (!(await findMaybe(sid, RESPONSE_SELECTOR))) {
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
      await cleanupPermissionProbe(seeded.agentId, seeded.sessionId);
    }
  },
);
