// Open a headed Chrome on the web app, connect to clio, and land on a specific
// session so you can WATCH it (live stream or reload). Stays open until you close it.
import { chromium } from '@playwright/test';

const WEBURL = process.env.WEBURL || 'http://localhost:4173';
const BACKEND = process.env.BACKEND || 'http://127.0.0.1:17801';
const WS_ID = process.env.WS_ID || 'ws_ndp_demo';
const SID = process.env.SID;
if (!SID) throw new Error('set SID=<session_id>');

const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();

await page.addInitScript(() => localStorage.setItem('clio.onboarding-done.v1', '1'));
await page.addInitScript((wid) => localStorage.setItem('clio.selected-workspace.v1', wid), WS_ID);
await page.addInitScript(
  (a) => {
    localStorage.setItem(`clio.active-session.${a.b}`, a.s);
    localStorage.setItem('clio.sessions-open.v1', 'true');
  },
  { b: BACKEND, s: SID },
);

const url = new URL(WEBURL);
url.searchParams.set('route', 'connect');
await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
if (await page.getByTestId('connect-url').isVisible().catch(() => false)) {
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
}
await page.waitForSelector('[data-testid="chat-screen"]', { timeout: 30000 }).catch(() => {});
// open sessions column + click the session if not already active
if (await page.getByTestId('topbar-sessions').count()) {
  const vis = await page.getByTestId('sessions-column').isVisible().catch(() => false);
  if (!vis) await page.getByTestId('topbar-sessions').click().catch(() => {});
}
await page.getByTestId(`session-row-${SID}`).click().catch(() => {});
console.log(`Watching ${SID} at ${WEBURL} — leave this window open. Ctrl+C here to close.`);
// stay open indefinitely
await new Promise(() => {});
