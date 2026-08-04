/**
 * The live gate: every surface driven against a REAL clio-agent.
 *
 * A passing mock spec is not evidence of live correctness — every wire-field
 * bug in this rebuild was found here and nowhere else. This script exists so
 * "live-verified" is a run with output, not a claim.
 *
 * Fails loudly: any console error, any response >= 400, any surface that does
 * not render is a defect, reported with its name.
 */
import { chromium } from '@playwright/test';

const PREVIEW = process.env['PREVIEW'] ?? 'http://127.0.0.1:4191';
const BACKEND = process.env['BACKEND'] ?? 'http://127.0.0.1:17900';

const failures = [];
const note = (ok, label, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });

const consoleErrors = [];
const httpErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('response', (r) => {
  if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url()}`);
});

// ---- connect ----------------------------------------------------------
// Warm boot: a real user's browser carries the saved registry, so the splash
// autoconnects silently on the first candidate. Cold-boot fallback noise is
// covered by the e2e boot-splash specs; THIS gate holds the zero-console-error
// bar on the everyday path.
await page.addInitScript(
  ([backend]) => {
    try {
      localStorage.setItem(
        'clio.backends.v3',
        JSON.stringify({
          backends: [
            { id: backend, label: 'live-gate', url: backend, bearerToken: '', kind: 'http' },
          ],
          currentId: backend,
        }),
      );
      localStorage.setItem('clio.backend.last-url.v3', backend);
    } catch {
      // Storage unavailable; the gate then exercises the cold path instead.
    }
  },
  [BACKEND],
);
await page.goto(PREVIEW, { waitUntil: 'networkidle' });
await page.getByRole('navigation', { name: /workspaces/i }).waitFor({ timeout: 30000 });
note(true, 'connect + handshake (warm splash autoconnect)');

// ---- shell chrome -----------------------------------------------------
const chrome = await page.evaluate(() => ({
  groups: document.querySelectorAll('.shell-rail__grouphead').length,
  groupIcons: [...document.querySelectorAll('.shell-rail__grouphead')].filter((h) => h.querySelector('svg')).length,
  disclosures: document.querySelectorAll('.shell-rail__groupdisclose').length,
  composerBottom: Math.round(document.querySelector('.composer')?.getBoundingClientRect().bottom ?? 0),
  connections: document.querySelector('[data-testid="rail-connections"]')?.textContent?.trim(),
  version: document.querySelector('[data-testid="version-stamp"]')?.textContent?.trim(),
  gearIsSvg: !!document.querySelector('.shell-rail__footcell--icon svg'),
  debugString: /select a session to open it/i.test(document.body.innerText),
}));
note(chrome.groups > 0, 'rail renders workspace groups', `${chrome.groups} groups`);
note(chrome.groupIcons === chrome.groups, 'every group head has its folder icon', `${chrome.groupIcons}/${chrome.groups}`);
note(chrome.disclosures === chrome.groups, 'every group head has a disclosure control');
note(chrome.composerBottom === 900, 'composer pinned to the viewport floor', `bottom=${chrome.composerBottom}`);
note(/^agents \d+$/.test(chrome.connections ?? ''), 'footer counts connected deployments', chrome.connections);
note(/^v\d/.test(chrome.version ?? ''), 'version stamp reads the backend version', chrome.version);
note(chrome.gearIsSvg, 'settings glyph is the prototype icon');
note(!chrome.debugString, 'no debug placeholder text');

// ---- empty session default -------------------------------------------
const ta = page.getByRole('textbox');
note(await ta.isEnabled(), 'default view offers a live composer');

// ---- open a real session ---------------------------------------------
const firstSession = page.locator('.shell-rail__session').first();
const title = (await firstSession.getAttribute('aria-label')) ?? '';
await firstSession.click();
await page.waitForTimeout(3500);

const transcript = await page.evaluate(() => ({
  messages: document.querySelectorAll('.transcript__message').length,
  unrenderable: document.querySelectorAll('[data-testid="part-unrenderable"]').length,
  toolResults: document.querySelectorAll('.part-toolresult').length,
  recorded: [...document.querySelectorAll('.part-toolresult')].filter((e) => e.textContent?.trim() === 'recorded').length,
  error: document.querySelector('[data-testid="transcript-error"]')?.textContent?.trim() ?? null,
  scrolls: (() => {
    const t = document.querySelector('.transcript');
    return t ? getComputedStyle(t).overflowY === 'auto' : false;
  })(),
}));
note(transcript.error === null, `session "${title}" loads`, transcript.error ?? '');
note(transcript.messages > 0, 'transcript renders messages', `${transcript.messages}`);
note(transcript.unrenderable === 0, 'no unrenderable part kinds', `${transcript.unrenderable}`);
note(transcript.recorded === 0, 'tool results show content, not "recorded"', `${transcript.toolResults} results`);
note(transcript.scrolls, 'the transcript owns scrolling');

// ---- composer controls ------------------------------------------------
const controls = await page.evaluate(() => ({
  model: document.querySelector('[data-testid="composer-model"]')?.textContent?.trim(),
  approval: document.querySelector('[data-testid="composer-approval"]')?.textContent?.trim(),
  attachUnbacked: !!document.querySelector('.composer__attach[data-unbacked="true"]'),
}));
note(!!controls.model, 'model control renders', controls.model);
note(!!controls.approval, 'approval control renders from session.approval_mode', controls.approval);
note(controls.attachUnbacked, 'attach ships visible + marked unbacked');

// Shift+Tab expand
await ta.focus();
const before = (await page.locator('.composer__frame').boundingBox())?.height ?? 0;
await page.keyboard.press('Shift+Tab');
await page.waitForTimeout(300);
const after = (await page.locator('.composer__frame').boundingBox())?.height ?? 0;
note(after > before + 50, 'Shift+Tab expands the composer', `${Math.round(before)} -> ${Math.round(after)}`);
await page.keyboard.press('Shift+Tab');

// ---- slash picker -----------------------------------------------------
await ta.fill('/');
await page.waitForTimeout(600);
const slash = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[role="option"]')].map((e) => e.textContent?.trim() ?? '');
  return { count: items.length, doubled: items.filter((i) => i.startsWith('//')).length };
});
note(slash.count > 0, 'slash picker lists backend commands', `${slash.count}`);
note(slash.doubled === 0, 'no double-slashed command ids');
await ta.fill('');

// ---- overlays ---------------------------------------------------------
await page.getByRole('button', { name: 'Settings' }).click();
await page.waitForTimeout(800);
const settings = await page.evaluate(() => {
  const card = document.querySelector('.kit-layer__card');
  const r = card?.getBoundingClientRect();
  return {
    shown: !!card,
    centred: r ? Math.abs(r.x + r.width / 2 - 720) < 20 : false,
    headings: card?.querySelectorAll('h2').length ?? 0,
    closes: card?.querySelectorAll('.kit-layer__close').length ?? 0,
  };
});
note(settings.shown && settings.centred, 'settings opens as a centred overlay');
note(settings.closes === 1, 'settings has exactly one close control', `${settings.closes}`);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
note((await page.locator('.kit-layer__card').count()) === 0, 'Escape closes the overlay');

await page.getByRole('button', { name: 'Observability' }).click();
await page.waitForTimeout(1500);
const obs = await page.evaluate(() => ({
  shown: !!document.querySelector('.kit-layer__card'),
  tabs: document.querySelectorAll('[role="tab"]').length,
}));
note(obs.shown, 'observability opens as an overlay');
note(obs.tabs >= 5, 'observability renders its tab set', `${obs.tabs} tabs`);
await page.keyboard.press('Escape');

// ---- connection swap --------------------------------------------------
await page.waitForTimeout(400);
await page.getByTestId('rail-connections').click();
await page.waitForTimeout(500);
note((await page.getByRole('menuitem').count()) > 0, 'connection swap menu opens');
await page.keyboard.press('Escape');

await page.screenshot({ path: 'screenshots/visual-check/live-e2e-final.png' });

// ---- clean-stream gate ------------------------------------------------
note(consoleErrors.length === 0, 'zero console errors', consoleErrors.slice(0, 3).join(' | '));
note(httpErrors.length === 0, 'zero HTTP errors', httpErrors.slice(0, 3).join(' | '));

await browser.close();

console.log(`\n${failures.length === 0 ? 'LIVE GATE PASSED' : `LIVE GATE FAILED (${failures.length})`}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
