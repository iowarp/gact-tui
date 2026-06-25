import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const APP = 'http://localhost:4173';
const BACKEND = 'http://127.0.0.1:17800';
const BP = 'earthscope-gnss-region';
const OUT = process.env.SHOTS || '/tmp';
const PROMPT =
  "What recent ground-motion is EarthScope's GNSS network showing around Los Angeles? " +
  'Pull a real station time series, plot it, and tell me how much to trust the data. ' +
  'Use NDP/EarthScope GNSS station evidence, stage a concrete CSV resource, profile the ' +
  'displacement and uncertainty columns, produce a PNG artifact from the staged CSV, and ' +
  'explain data freshness, coverage, and provenance limitations.';

const api = async (m, p, b) => {
  const r = await fetch(BACKEND + p, {
    method: m,
    headers: { 'content-type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status}`);
  return r.json().catch(() => ({}));
};

const ws = (await api('GET', '/v1/workspaces')).workspaces?.[0]?.id;
const sid = (await api('POST', '/v1/sessions', { workspace_id: ws, title: 'live-stream probe' })).id;
console.log('session', sid);
try { await api('POST', `/v1/sessions/${sid}/agent-blueprint`, { blueprint_id: BP }); } catch (e) { console.log('bp', e.message); }

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-web-security'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 2600 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem('clio.onboarding-done.v1', '1');
    localStorage.setItem('clio.selected-workspace.v1', '__all');
    localStorage.setItem('clio.preview-rail-open.v1', 'false');
  } catch {}
});
await page.goto(`${APP}/?route=connect`);
await page.getByTestId('connect-url').fill(BACKEND);
await page.getByTestId('connect-submit').click();
await page.getByTestId('chat-screen').waitFor({ state: 'visible', timeout: 20000 });
const row = page.getByTestId(`session-row-${sid}`);
await row.waitFor({ state: 'visible', timeout: 20000 });
await row.click();
await page.getByTestId('composer-input').waitFor({ state: 'visible', timeout: 15000 });
await page.getByTestId('composer-input').fill(PROMPT);
await page.getByTestId('composer-send').click();
console.log('PROMPT SENT — polling live DOM');

const probeFn = () => {
  const out = {};
  out.has = {
    extree: !!document.querySelector('[class*="extree"], [data-testid="execution-tree"]'),
    cxTrace: !!document.querySelector('.cx-trace, [data-testid="conversation-execution-trace"]'),
    assistantTurn: !!document.querySelector('[data-testid="assistant-turn"]'),
    trxBlock: document.querySelectorAll('.trx-block').length,
    tools: document.querySelectorAll('[data-testid="assistant-turn-tool"]').length,
  };
  const labels = [...document.querySelectorAll('*')].filter(
    (e) => e.children.length === 0 && /agent execution|execution trace/i.test(e.textContent || ''),
  );
  out.labels = labels.map((e) => {
    const box = e.closest('[class]');
    const cs = box && getComputedStyle(box);
    return { text: (e.textContent || '').trim().slice(0, 30), boxCls: (box?.className || '').toString().slice(0, 40), font: cs?.fontSize };
  });
  const um = document.querySelector('.trx-msg--user .trx-text, .trx-msg--user .im, .trx-msg--user p');
  if (um) { const cs = getComputedStyle(um); out.userMsg = { w: um.clientWidth, maxW: cs.maxWidth, font: cs.fontSize }; }
  return out;
};

// Poll while the run streams; capture the live (execution_tree) state.
let captured = null;
let firstShotTaken = false;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(2000);
  const probe = await page.evaluate(probeFn);
  if (probe.has.assistantTurn || probe.has.extree || probe.has.trxBlock > 0) {
    captured = probe;
    console.log(`[t=${i * 2}s]`, JSON.stringify(probe.has), 'labels=', probe.labels.length);
    if (!firstShotTaken) {
      // Capture the mid-stream render the moment structure first appears.
      await page.screenshot({ path: `${OUT}/web-live-stream-firstframe.png`, fullPage: true });
      firstShotTaken = true;
    }
  }
  // Stop once the run is idle on the backend AND we have a captured structure.
  const status = await api('GET', `/v1/sessions/${sid}`).then((s) => s.status).catch(() => '');
  if ((status === 'idle' || status === 'completed' || status === 'ready') && captured) {
    console.log('run idle');
    break;
  }
}

const finalProbe = await page.evaluate(probeFn);
console.log('FINAL', JSON.stringify(finalProbe, null, 2));
const html = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="transcript"]') || document.querySelector('main');
  return el ? el.outerHTML : '(none)';
});
writeFileSync(`${OUT}/live-stream-dom.html`, html);
await page.screenshot({ path: `${OUT}/web-live-stream-unified.png`, fullPage: true });
await browser.close();
