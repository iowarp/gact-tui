import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_QUERY =
  'Find the nearest EarthScope GNSS station to Los Angeles, stage its time-series CSV, profile it, and create a displacement time-series plot.';

function parseArgs(argv) {
  const out = {
    webUrl: process.env.CLIO_WEB_URL || 'http://localhost:4173',
    backendUrl: process.env.CLIO_BACKEND_URL || 'http://localhost:17800',
    provider: process.env.CLIO_DEMO_PROVIDER || 'claude_code',
    model: process.env.CLIO_DEMO_MODEL || 'haiku',
    apiBase: process.env.CLIO_DEMO_API_BASE || 'claude-code://sdk',
    transport: process.env.CLIO_DEMO_TRANSPORT || 'sdk',
    blueprint: process.env.CLIO_DEMO_BLUEPRINT || 'earthscope-gnss-region',
    outDir:
      process.env.CLIO_DEMO_OUT ||
      path.join('screenshots', `web-demo-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    workspaceName: process.env.CLIO_DEMO_WORKSPACE_NAME || 'EarthScope demo',
    workspaceRoot: process.env.CLIO_DEMO_WORKSPACE_ROOT || '',
    workspaceId: process.env.CLIO_DEMO_WORKSPACE_ID || '',
    sessionId: process.env.CLIO_DEMO_SESSION_ID || '',
    freshWorkspace: process.env.CLIO_DEMO_FRESH_WORKSPACE === '1',
    reloadOnly: process.env.CLIO_DEMO_RELOAD_ONLY === '1',
    headless: process.env.CLIO_DEMO_HEADLESS !== '0',
    configureProvider: process.env.CLIO_DEMO_CONFIGURE_PROVIDER !== '0',
    fetchTimeoutMs: Number(process.env.CLIO_DEMO_FETCH_TIMEOUT_MS || 30_000),
    maxWaitMs: Number(process.env.CLIO_DEMO_MAX_WAIT_MS || 15 * 60_000),
    settleMs: Number(process.env.CLIO_DEMO_SETTLE_MS || 2_000),
    autoscrollTolerancePx: Number(process.env.CLIO_DEMO_AUTOSCROLL_TOLERANCE_PX || 24),
    queries: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value == null) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--web-url') out.webUrl = next();
    else if (arg === '--backend-url') out.backendUrl = next();
    else if (arg === '--provider') out.provider = next();
    else if (arg === '--model') out.model = next();
    else if (arg === '--api-base') out.apiBase = next();
    else if (arg === '--transport') out.transport = next();
    else if (arg === '--blueprint') out.blueprint = next();
    else if (arg === '--workspace-name') out.workspaceName = next();
    else if (arg === '--workspace-root') out.workspaceRoot = next();
    else if (arg === '--workspace-id') out.workspaceId = next();
    else if (arg === '--session-id') out.sessionId = next();
    else if (arg === '--query') out.queries.push(next());
    else if (arg === '--queries') out.queriesFile = next();
    else if (arg === '--out') out.outDir = next();
    else if (arg === '--fresh-workspace') out.freshWorkspace = true;
    else if (arg === '--reload-only') out.reloadOnly = true;
    else if (arg === '--headed') out.headless = false;
    else if (arg === '--headless') out.headless = true;
    else if (arg === '--no-configure-provider') out.configureProvider = false;
    else if (arg === '--max-wait-ms') out.maxWaitMs = Number(next());
    else if (arg === '--fetch-timeout-ms') out.fetchTimeoutMs = Number(next());
    else if (arg === '--settle-ms') out.settleMs = Number(next());
    else if (arg === '--autoscroll-tolerance-px') out.autoscrollTolerancePx = Number(next());
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  pnpm --filter @clio/web demo:record -- \\
    --provider claude_code --model haiku --blueprint earthscope-gnss-region \\
    --query "Find the nearest EarthScope GNSS station to Los Angeles..." \\
    --out screenshots/demo-earthscope

Options:
  --web-url URL                 Web UI URL. Default: CLIO_WEB_URL or http://localhost:4173
  --backend-url URL             CLIO backend URL. Default: CLIO_BACKEND_URL or http://localhost:17800
  --provider ID                 Provider id to configure through /v1/providers/lm.
  --model ID                    Model id to configure.
  --api-base URL                Provider API base. Default supports claude_code exec.
  --transport NAME              Provider transport field, when accepted by backend.
  --blueprint ID                Agent blueprint selected in the new-session modal.
  --workspace-name NAME         Workspace name to create/reuse for the recording.
  --workspace-root PATH         Workspace root. Default: <out>/workspace.
  --workspace-id ID             Existing workspace id. Required for --reload-only unless name/root resolve.
  --session-id ID               Existing session id for --reload-only.
  --fresh-workspace             Always create a new isolated workspace with a timestamp suffix.
  --reload-only                 Do not send queries; connect, select --session-id, and capture reload evidence.
  --query TEXT                  Query to send. May be repeated.
  --queries FILE                JSON array of query strings or {"queries":[...]}.
  --out DIR                     Artifact directory.
  --headed                      Show browser while recording.
  --no-configure-provider       Do not PUT /v1/providers/lm before recording.
  --settle-ms MS                Wait before final/reload captures. Default: 2000.
`);
}

const opts = parseArgs(process.argv.slice(2));
opts.outDir = path.resolve(opts.outDir);
await fs.mkdir(opts.outDir, { recursive: true });
if (opts.freshWorkspace) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  opts.workspaceName = `${opts.workspaceName} ${stamp}`;
  if (!opts.workspaceRoot) {
    opts.workspaceRoot = path.join(opts.outDir, `workspace-${stamp}`);
  }
}
if (!opts.workspaceRoot) {
  opts.workspaceRoot = path.join(opts.outDir, 'workspace');
}
opts.workspaceRoot = path.resolve(opts.workspaceRoot);
await fs.mkdir(opts.workspaceRoot, { recursive: true });
if (opts.reloadOnly && !opts.sessionId) {
  throw new Error('--reload-only requires --session-id');
}

if (opts.queriesFile) {
  const raw = JSON.parse(await fs.readFile(opts.queriesFile, 'utf8'));
  const loaded = Array.isArray(raw) ? raw : raw.queries;
  if (!Array.isArray(loaded) || loaded.some((q) => typeof q !== 'string')) {
    throw new Error('--queries must point to a JSON array of strings or {"queries":[...]}');
  }
  opts.queries.push(...loaded);
}
if (opts.queries.length === 0) opts.queries.push(DEFAULT_QUERY);

function artifact(name) {
  return path.join(opts.outDir, name);
}

async function writeJson(name, value) {
  await fs.writeFile(artifact(name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function api(method, pathname, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.fetchTimeoutMs);
  try {
    const res = await fetch(`${opts.backendUrl}${pathname}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${text.slice(0, 1000)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function configureProvider() {
  if (!opts.configureProvider) return;
  await api('PUT', '/v1/providers/lm', {
    provider: opts.provider,
    api_base: opts.apiBase,
    model: opts.model,
    transport: opts.transport,
    // For claude_code, force the streaming SDK transport (persistent CLI session,
    // real token + thinking deltas) instead of the exec `-p` one-shot batch.
    ...(opts.provider === 'claude_code' ? { claude_code_transport: 'sdk' } : {}),
    max_tokens: 32000,
  });
}

async function ensureWorkspace() {
  if (opts.workspaceId) {
    const current = await api('GET', '/v1/workspaces');
    const existing = (current.workspaces || []).find((workspace) => workspace.id === opts.workspaceId);
    if (!existing) throw new Error(`Workspace ${opts.workspaceId} was not found`);
    return existing;
  }
  const current = await api('GET', '/v1/workspaces');
  if (!opts.freshWorkspace) {
    const existing = (current.workspaces || []).find(
      (workspace) =>
        workspace.name === opts.workspaceName &&
        path.resolve(workspace.root_path || '') === opts.workspaceRoot,
    );
    if (existing) return existing;
  }
  return api('POST', '/v1/workspaces', {
    name: opts.workspaceName,
    root_path: opts.workspaceRoot,
    metadata: {
      purpose: 'web-demo-recording',
      created_by: 'record-web-demo',
    },
  });
}

function newestBlueprintSession(sessions, initialIds) {
  return [...sessions]
    .filter((s) => !initialIds.has(s.id))
    .filter((s) => {
      if (!opts.blueprint) return true;
      return (
        s.metadata?.active_agent_blueprint_id === opts.blueprint ||
        s.metadata?.agent_blueprint_id === opts.blueprint
      );
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

async function browserApi(page, pathname) {
  return page.evaluate(
    async ({ backendUrl, pathname, fetchTimeoutMs }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
      try {
        const res = await fetch(`${backendUrl}${pathname}`, { signal: controller.signal });
        const text = await res.text();
        if (!res.ok) throw new Error(`${pathname} -> ${res.status}: ${text.slice(0, 1000)}`);
        return text ? JSON.parse(text) : {};
      } finally {
        clearTimeout(timeout);
      }
    },
    { backendUrl: opts.backendUrl, pathname, fetchTimeoutMs: opts.fetchTimeoutMs },
  );
}

async function dumpPage(page, name) {
  await page.screenshot({ path: artifact(`${name}.png`), fullPage: true });
  await fs.writeFile(artifact(`${name}.html`), await page.content(), 'utf8');
  const visibleText = await page.locator('body').innerText().catch(() => '');
  await fs.writeFile(artifact(`${name}.visible-text.txt`), visibleText, 'utf8');
  const transcriptHtml = await page
    .locator('[data-testid="transcript"]')
    .evaluate((el) => el.outerHTML)
    .catch(() => '');
  await fs.writeFile(artifact(`${name}.transcript.html`), transcriptHtml, 'utf8');
  const coreTranscriptHtml = await page
    .locator('[data-testid="transcript"]')
    .evaluate((el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src') || '';
        img.setAttribute('data-original-src-length', String(src.length));
        img.setAttribute('src', '[image omitted]');
      });
      clone.querySelectorAll('canvas, video, audio').forEach((node) => {
        node.replaceWith(document.createComment(`${node.tagName.toLowerCase()} omitted`));
      });
      return clone.outerHTML;
    })
    .catch(() => '');
  await fs.writeFile(artifact(`${name}.transcript-core.html`), coreTranscriptHtml, 'utf8');
  const layout = await page
    .evaluate(() => {
      const boxFor = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
        };
      };
      const pane = document.querySelector('[data-testid="transcript-pane"]');
      const scroll = pane
        ? {
            scrollTop: Math.round(pane.scrollTop),
            scrollHeight: Math.round(pane.scrollHeight),
            clientHeight: Math.round(pane.clientHeight),
            distanceFromBottom: Math.round(
              Math.max(0, pane.scrollHeight - pane.scrollTop - pane.clientHeight),
            ),
          }
        : null;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scroll,
        boxes: {
          transcriptPane: boxFor('[data-testid="transcript-pane"]'),
          transcript: boxFor('[data-testid="transcript"]'),
          composer: boxFor('[data-testid="composer-input"]'),
          send: boxFor('[data-testid="composer-send"]'),
          version: boxFor('[data-testid="version-badge"], .version-badge'),
          scrollToBottom: boxFor('[data-testid="scroll-to-bottom"]'),
          contextFooter: boxFor('.chat__context-footer'),
        },
      };
    })
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  await writeJson(`${name}.layout.json`, layout);
}

async function transcriptScrollState(page) {
  return page
    .getByTestId('transcript-pane')
    .evaluate((el) => {
      const distance = Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        distanceFromBottom: distance,
      };
    })
    .catch(() => null);
}

async function assertAutoscroll(page, label, states) {
  const state = await transcriptScrollState(page);
  if (!state) return;
  states.push({ label, at: new Date().toISOString(), ...state });
  const visibleJump = await page.getByTestId('scroll-to-bottom').isVisible().catch(() => false);
  if (!visibleJump && state.distanceFromBottom > opts.autoscrollTolerancePx) {
    const error = new Error(
      `autoscroll drifted during ${label}: ${Math.round(
        state.distanceFromBottom,
      )}px from bottom with jump control hidden`,
    );
    error.autoscrollFailure = true;
    throw error;
  }
}

let permissionCaptureCount = 0;
async function resolvePendingPermission(page) {
  const card = page.getByTestId('permission-card');
  if (!(await card.isVisible().catch(() => false))) return false;
  permissionCaptureCount += 1;
  await dumpPage(page, `permission-${String(permissionCaptureCount).padStart(2, '0')}`);
  await page.getByTestId('permcard-allow-session').click();
  await page.waitForTimeout(1_000);
  return true;
}

async function connect(page) {
  const url = new URL(opts.webUrl);
  url.searchParams.set('route', 'connect');
  await page.addInitScript(() => {
    localStorage.setItem('clio.onboarding-done.v1', '1');
  });
  await page.addInitScript((workspaceId) => {
    localStorage.setItem('clio.selected-workspace.v1', workspaceId);
  }, opts.workspaceId);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  if (await page.getByTestId('connect-url').isVisible().catch(() => false)) {
    await page.getByTestId('connect-url').fill(opts.backendUrl);
    await page.getByTestId('connect-submit').click();
  }
  await page.waitForSelector('[data-testid="chat-screen"]', { timeout: 30_000 });
}

async function createBlueprintSession(page) {
  const sessionListPath = `/v1/sessions?workspace_id=${encodeURIComponent(opts.workspaceId)}`;
  const initialSessions = await browserApi(page, sessionListPath);
  const initialIds = new Set((initialSessions.sessions || []).map((s) => s.id));

  if (await page.getByTestId('topbar-sessions').count()) {
    const visible = await page.getByTestId('sessions-column').isVisible().catch(() => false);
    if (!visible) await page.getByTestId('topbar-sessions').click();
  }

  const canOpenSessionModal = await page.getByTestId('sessions-new').isVisible().catch(() => false);
  if (!canOpenSessionModal) {
    const created = await api('POST', '/v1/sessions', {
      title: opts.queries[0]?.slice(0, 60) || 'EarthScope demo',
      workspace_id: opts.workspaceId,
    });
    if (opts.blueprint) {
      await api('POST', `/v1/sessions/${created.id}/agent-blueprint`, {
        blueprint_id: opts.blueprint,
      });
    }
    await page.evaluate(
      ({ backendUrl, sessionId }) => {
        localStorage.setItem(`clio.active-session.${backendUrl}`, sessionId);
        localStorage.setItem('clio.sessions-open.v1', 'true');
      },
      { backendUrl: opts.backendUrl, sessionId: created.id },
    );
    await connect(page);
    await page.waitForSelector('[data-testid="composer-input"]', { timeout: 30_000 });
    return created;
  }

  await page.getByTestId('sessions-new').click();
  await page.waitForSelector('[data-testid="session-semantics-modal"]', { timeout: 15_000 });
  if (opts.blueprint) {
    await page.getByTestId('session-semantics-blueprint').selectOption(opts.blueprint);
  }
  await dumpPage(page, '01-new-session-modal');
  await page.getByTestId('session-semantics-start').click();
  await page.waitForSelector('[data-testid="session-semantics-modal"]', {
    state: 'detached',
    timeout: 30_000,
  });

  let selected = null;
  for (let i = 0; i < 80; i += 1) {
    const data = await browserApi(page, sessionListPath);
    selected = newestBlueprintSession(data.sessions || [], initialIds);
    if (selected) break;
    await page.waitForTimeout(500);
  }
  if (!selected) throw new Error(`No new ${opts.blueprint || 'default'} session appeared`);
  await page.getByTestId(`session-row-${selected.id}`).click();
  await page.waitForSelector('[data-testid="composer-input"]', { timeout: 30_000 });
  return selected;
}

async function selectExistingSession(page, sessionId) {
  const sessionListPath = `/v1/sessions?workspace_id=${encodeURIComponent(opts.workspaceId)}`;
  const sessions = await browserApi(page, sessionListPath);
  const selected = (sessions.sessions || []).find((session) => session.id === sessionId);
  if (!selected) {
    throw new Error(`Session ${sessionId} was not found in workspace ${opts.workspaceId}`);
  }
  if (await page.getByTestId('topbar-sessions').count()) {
    const visible = await page.getByTestId('sessions-column').isVisible().catch(() => false);
    if (!visible) await page.getByTestId('topbar-sessions').click();
  }
  await page.getByTestId(`session-row-${sessionId}`).click().catch(async () => {
    await page.evaluate(
      ({ backendUrl, sessionId: selectedSessionId }) => {
        localStorage.setItem(`clio.active-session.${backendUrl}`, selectedSessionId);
        localStorage.setItem('clio.sessions-open.v1', 'true');
      },
      { backendUrl: opts.backendUrl, sessionId },
    );
    await connect(page);
  });
  await page.waitForSelector('[data-testid="composer-input"]', { timeout: 30_000 });
  return selected;
}

async function waitForTurn(page, sessionId, queryIndex, minMessageCount, autoscrollStates) {
  let latestSessions = null;
  let current = null;
  const startedAt = Date.now();
  let earlyCaptured = false;
  let midCaptured = false;
  while (Date.now() - startedAt < opts.maxWaitMs) {
    await resolvePendingPermission(page);
    await assertAutoscroll(page, `query-${queryIndex + 1}`, autoscrollStates);
    latestSessions = await browserApi(
      page,
      `/v1/sessions?workspace_id=${encodeURIComponent(opts.workspaceId)}`,
    );
    current = (latestSessions.sessions || []).find((s) => s.id === sessionId);
    const elapsed = Date.now() - startedAt;
    if (!earlyCaptured && elapsed >= 5_000) {
      await dumpPage(page, `q${queryIndex + 1}-live-early`);
      earlyCaptured = true;
    }
    if (!midCaptured && elapsed >= 60_000) {
      await dumpPage(page, `q${queryIndex + 1}-live-mid`);
      midCaptured = true;
    }
    if (
      ['idle', 'finished', 'error', 'cancelled'].includes(current?.status || '') &&
      current.message_count >= minMessageCount
    ) {
      return { current, latestSessions };
    }
    await page.waitForTimeout(2_000);
  }
  throw new Error(`Timed out waiting for query ${queryIndex + 1} after ${opts.maxWaitMs}ms`);
}

async function convertVideoToMp4(webmPath) {
  const mp4Path = artifact('demo.mp4');
  return new Promise((resolve) => {
    const child = spawn(
      'ffmpeg',
      ['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path],
      { windowsHide: true },
    );
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    child.on('error', (error) => {
      resolve({ mp4_created: false, mp4_path: null, error: error.message });
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ mp4_created: true, mp4_path: mp4Path });
      } else {
        resolve({
          mp4_created: false,
          mp4_path: null,
          error: `ffmpeg exited ${code}: ${stderr.join('').slice(-2000)}`,
        });
      }
    });
  });
}

await configureProvider();
const workspace = await ensureWorkspace();
opts.workspaceId = workspace.id;
await writeJson('run-config.json', {
  ...opts,
  queriesFile: opts.queriesFile || null,
  workspace,
  started_at: new Date().toISOString(),
});
await writeJson('provider.json', await api('GET', '/v1/providers/lm'));
await writeJson('blueprints.json', await api('GET', '/v1/agent-blueprints?scope=global'));
await writeJson('capabilities.json', await api('GET', '/v1/capabilities'));

const browser = await chromium.launch({ headless: opts.headless });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  recordVideo: { dir: opts.outDir, size: { width: 1440, height: 950 } },
});
const page = await context.newPage();
const browserLog = [];
const autoscrollStates = [];

page.on('console', (msg) => browserLog.push(`[${msg.type()}] ${msg.text()}`));
page.on('requestfailed', (req) =>
  browserLog.push(`[requestfailed] ${req.method()} ${req.url()} ${req.failure()?.errorText}`),
);
page.on('response', async (res) => {
  if (!res.url().startsWith(opts.backendUrl) || res.status() < 400) return;
  const text = await res.text().catch(() => '');
  browserLog.push(
    `[response ${res.status()}] ${res.request().method()} ${res.url()} ${text.slice(0, 1000)}`,
  );
});

let selected = null;
let finalSession = null;
let autoscrollError = null;
try {
  await connect(page);
  selected = opts.reloadOnly ? await selectExistingSession(page, opts.sessionId) : await createBlueprintSession(page);
  await writeJson('selected-session-before-send.json', selected);
  await dumpPage(page, '02-selected-before-send');

  if (!opts.reloadOnly) {
    for (const [index, query] of opts.queries.entries()) {
      const beforeMessages = await browserApi(page, `/v1/sessions/${selected.id}/messages`);
      const minMessageCount = (beforeMessages.messages || []).length + 2;
      await page.getByTestId('composer-input').fill(query);
      await page.getByTestId('composer-send').click();
      const result = await waitForTurn(page, selected.id, index, minMessageCount, autoscrollStates);
      finalSession = result.current;
      await page.waitForTimeout(opts.settleMs);
      await dumpPage(page, `q${index + 1}-live-final`);
    }
  } else {
    finalSession = selected;
  }

  const messages = await browserApi(page, `/v1/sessions/${selected.id}/messages`);
  await writeJson('messages.json', messages);
  await writeJson(
    'sessions-after-run.json',
    await browserApi(page, `/v1/sessions?workspace_id=${encodeURIComponent(opts.workspaceId)}`),
  );

  await connect(page);
  await page.getByTestId(`session-row-${selected.id}`).click().catch(() => {});
  await page.waitForTimeout(opts.settleMs);
  await dumpPage(page, 'reload');

  await writeJson('autoscroll.json', {
    tolerance_px: opts.autoscrollTolerancePx,
    states: autoscrollStates,
    passed: true,
  });
  await writeJson('summary.json', {
    session_id: selected.id,
    status: finalSession?.status || '',
    message_count: finalSession?.message_count || 0,
    queries: opts.queries,
    output_dir: opts.outDir,
  });
} catch (error) {
  if (error?.autoscrollFailure) autoscrollError = error.message;
  await writeJson('autoscroll.json', {
    tolerance_px: opts.autoscrollTolerancePx,
    states: autoscrollStates,
    passed: !autoscrollError,
    error: autoscrollError,
    recorder_error: error instanceof Error ? error.message : String(error),
  }).catch(() => {});
  await dumpPage(page, 'failure').catch(() => {});
  throw error;
} finally {
  await fs.writeFile(artifact('browser.log'), `${browserLog.join('\n')}\n`, 'utf8');
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const videoPath = await video.path().catch(() => '');
    if (videoPath) {
      const finalVideo = artifact('demo.webm');
      await fs.rename(videoPath, finalVideo).catch(async () => {
        await fs.copyFile(videoPath, finalVideo);
        await fs.unlink(videoPath).catch(() => {});
      });
      await writeJson('video.json', {
        webm_path: finalVideo,
        ...(await convertVideoToMp4(finalVideo)),
      }).catch(() => {});
    }
  }
}

console.log(`Recorded CLIO web demo to ${opts.outDir}`);
