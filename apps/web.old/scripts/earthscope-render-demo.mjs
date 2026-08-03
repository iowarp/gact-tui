import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const webUrl = process.env.CLIO_WEB_URL || 'http://localhost:4173';
const backendUrl = process.env.CLIO_BACKEND_URL || 'http://localhost:17800';
const blueprintId = process.env.CLIO_EARTHSCOPE_BLUEPRINT || 'earthscope-gnss-region';
const prompt =
  process.env.CLIO_EARTHSCOPE_PROMPT ||
  'Find the nearest EarthScope GNSS station to Los Angeles, stage its time-series CSV, profile it, and create a displacement time-series plot.';
const outDir = path.resolve(process.env.CLIO_EARTHSCOPE_OUT || 'screenshots/earthscope-render-demo');
const headless = process.env.CLIO_EARTHSCOPE_HEADLESS !== '0';
const fetchTimeoutMs = Number(process.env.CLIO_EARTHSCOPE_FETCH_TIMEOUT_MS || 30_000);
const maxWaitMs = Number(process.env.CLIO_EARTHSCOPE_MAX_WAIT_MS || 15 * 60_000);

await fs.mkdir(outDir, { recursive: true });

function artifact(name) {
  return path.join(outDir, name);
}

async function writeJson(name, value) {
  await fs.writeFile(artifact(name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function apiFromNode(method, pathname, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const res = await fetch(`${backendUrl}${pathname}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${text.slice(0, 800)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function configureProvider() {
  if (process.env.CLIO_EARTHSCOPE_CONFIGURE_PROVIDER === '0') return;
  await apiFromNode('PUT', '/v1/providers/lm', {
    provider: 'claude_code',
    api_base: 'claude-code://exec',
    model: 'haiku',
    transport: 'exec',
    max_tokens: 32000,
  });
}

function newestBlueprintSession(sessions) {
  return [...sessions]
    .filter((s) => s.metadata?.active_agent_blueprint_id === blueprintId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

async function dumpPage(page, name) {
  await page.screenshot({ path: artifact(`${name}.png`), fullPage: true });
  await fs.writeFile(artifact(`${name}.html`), await page.content(), 'utf8');
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

async function browserApi(page, pathname) {
  return page.evaluate(
    async ({ backendUrl, pathname, fetchTimeoutMs }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
      try {
        const res = await fetch(`${backendUrl}${pathname}`, { signal: controller.signal });
        const text = await res.text();
        if (!res.ok) throw new Error(`${pathname} -> ${res.status}: ${text.slice(0, 800)}`);
        return JSON.parse(text);
      } finally {
        clearTimeout(timeout);
      }
    },
    { backendUrl, pathname, fetchTimeoutMs },
  );
}

await configureProvider();
await writeJson('provider.json', await apiFromNode('GET', '/v1/providers/lm'));
await writeJson('blueprints.json', await apiFromNode('GET', '/v1/agent-blueprints?scope=global'));

const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const browserLog = [];
page.on('console', (msg) => browserLog.push(`[${msg.type()}] ${msg.text()}`));
page.on('requestfailed', (req) =>
  browserLog.push(`[requestfailed] ${req.method()} ${req.url()} ${req.failure()?.errorText}`),
);
page.on('response', async (res) => {
  if (!res.url().startsWith(backendUrl) || res.status() < 400) return;
  const text = await res.text().catch(() => '');
  browserLog.push(
    `[response ${res.status()}] ${res.request().method()} ${res.url()} ${text.slice(0, 1000)}`,
  );
});

try {
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="chat-screen"]', { timeout: 30_000 });
  await page.evaluate(() => {
    localStorage.setItem('clio.onboarding-done.v1', '1');
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('clio.active-session.')) localStorage.removeItem(key);
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="chat-screen"]', { timeout: 30_000 });
  if (await page.getByTestId('onboarding-skip').isVisible().catch(() => false)) {
    await page.getByTestId('onboarding-skip').click();
  }

  const initialSessions = await browserApi(page, '/v1/sessions?include_all_workspaces=true');
  const initialIds = new Set((initialSessions.sessions || []).map((s) => s.id));

  if (await page.getByTestId('topbar-sessions').count()) {
    const visible = await page.getByTestId('sessions-column').isVisible().catch(() => false);
    if (!visible) await page.getByTestId('topbar-sessions').click();
  }

  await page.getByTestId('sessions-new').click();
  await page.waitForSelector('[data-testid="session-semantics-modal"]', { timeout: 15_000 });
  await page.getByTestId('session-semantics-blueprint').selectOption(blueprintId);
  await dumpPage(page, '01-modal');
  await page.getByTestId('session-semantics-start').click();
  await page.waitForSelector('[data-testid="session-semantics-modal"]', {
    state: 'detached',
    timeout: 30_000,
  });

  let selected = null;
  for (let i = 0; i < 80; i += 1) {
    const data = await browserApi(page, '/v1/sessions?include_all_workspaces=true');
    selected = newestBlueprintSession(
      (data.sessions || []).filter((session) => !initialIds.has(session.id)),
    );
    if (selected) break;
    await page.waitForTimeout(500);
  }
  if (!selected) throw new Error(`No new ${blueprintId} session appeared after modal start`);
  await writeJson('selected-session-before-send.json', selected);

  await page.getByTestId(`session-row-${selected.id}`).click();
  await page.waitForSelector('[data-testid="composer-input"]', { timeout: 30_000 });
  await dumpPage(page, '02-selected-before-send');

  await page.getByTestId('composer-input').fill(prompt);
  await page.getByTestId('composer-send').click();
  await page.waitForTimeout(5_000);
  await resolvePendingPermission(page);
  await dumpPage(page, '03-live-early');

  let latestSessions = null;
  let current = null;
  const startedAt = Date.now();
  let midCaptured = false;
  let laterCaptured = false;
  while (Date.now() - startedAt < maxWaitMs) {
    await resolvePendingPermission(page);
    latestSessions = await browserApi(page, '/v1/sessions?include_all_workspaces=true');
    current = (latestSessions.sessions || []).find((s) => s.id === selected.id);
    const elapsed = Date.now() - startedAt;
    if (!midCaptured && elapsed >= 60_000) {
      await dumpPage(page, '04-live-mid');
      midCaptured = true;
    }
    if (!laterCaptured && elapsed >= 3 * 60_000) {
      await dumpPage(page, '05-live-later');
      laterCaptured = true;
    }
    if (['idle', 'error', 'cancelled'].includes(current?.status || '') && current.message_count >= 2) {
      break;
    }
    await page.waitForTimeout(5_000);
  }
  if (!midCaptured) await dumpPage(page, '04-live-mid');
  if (!laterCaptured) await dumpPage(page, '05-live-later');
  await dumpPage(page, '06-live-final');
  await writeJson('sessions-after-run.json', latestSessions);
  await writeJson('messages.json', await browserApi(page, `/v1/sessions/${selected.id}/messages`));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="chat-screen"]', { timeout: 30_000 });
  await page.getByTestId(`session-row-${selected.id}`).click().catch(() => {});
  await page.waitForTimeout(2_000);
  await dumpPage(page, '07-reload');

  await writeJson('summary.json', {
    session_id: selected.id,
    status: current?.status || '',
    message_count: current?.message_count || 0,
    output_dir: outDir,
  });
  console.log(`EarthScope render demo captured ${selected.id} (${current?.status || 'unknown'})`);
  console.log(outDir);
} finally {
  await fs.writeFile(artifact('browser.log'), `${browserLog.join('\n')}\n`, 'utf8');
  await browser.close();
}
