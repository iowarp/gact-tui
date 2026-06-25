import { chromium } from '@playwright/test';

const APP = 'http://localhost:4173';
const BACKEND = 'http://127.0.0.1:17800';
const BP = 'earthscope-gnss-region';
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
console.log('workspace', ws);
const sid = (await api('POST', '/v1/sessions', { workspace_id: ws, title: 'EarthScope live demo' })).id;
console.log('session', sid);
try {
  await api('POST', `/v1/sessions/${sid}/agent-blueprint`, { blueprint_id: BP });
  console.log('blueprint bound:', BP);
} catch (e) {
  console.log('blueprint bind failed (continuing):', e.message);
}

const browser = await chromium.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-web-security', '--start-maximized'],
});
const ctx = await browser.newContext({ viewport: null });
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
console.log('connected to live clio');

const row = page.getByTestId(`session-row-${sid}`);
await row.waitFor({ state: 'visible', timeout: 20000 });
await row.click();
await page.getByTestId('composer-input').waitFor({ state: 'visible', timeout: 15000 });
await page.getByTestId('composer-input').fill(PROMPT);
await page.getByTestId('composer-send').click();
console.log('PROMPT SENT — watch it stream in the visible window');

await new Promise(() => {}); // keep the window open
