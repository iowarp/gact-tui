/**
 * Headless probe: connect to LIVE clio, open the target session, render the
 * assistant turn, then DUMP the real DOM tree of the assistant turn — tag,
 * classes, testid, whether each element draws a "box" (border/background/
 * radius/shadow) and whether it is a collapse control. Identifies the actual
 * renderer.
 *
 *   node tests/visual/probe-flat-dom.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_URL = process.env['CLIO_WEB_URL'] ?? 'http://localhost:4173';
const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';
const TARGET = process.env['CLIO_TARGET_SESSION'] ?? 'sess_a05a6efff5cf';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const SHOT_DIR = resolve(REPO_ROOT, 'apps', 'web', 'screenshots');
mkdirSync(SHOT_DIR, { recursive: true });
const OUT = process.env['PROBE_OUT'] ?? '/tmp/flat-dom-probe.txt';

function log(...a) { console.log(new Date().toISOString(), ...a); }

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1600 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
    window.localStorage.setItem('clio.selected-workspace.v1', '__all');
    window.localStorage.setItem('clio.preview-rail-open.v1', 'false');
  });
  await page.goto(`${APP_URL}/?route=connect`);
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await page.getByTestId('chat-screen').waitFor({ state: 'visible', timeout: 20_000 });
  log('connected');
  await page.waitForTimeout(1200);
  const row = page.getByTestId(`session-row-${TARGET}`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await page.getByTestId('transcript-pane').waitFor({ state: 'visible', timeout: 20_000 });
  log('session open');
  await page.waitForTimeout(4500);

  // Expand any execution-trace disclosures so nested rows render.
  try {
    const details = page.locator('[data-testid="conversation-execution-trace"]');
    const n = await details.count();
    for (let i = 0; i < n; i += 1) {
      await details.nth(i).evaluate((el) => { try { el.open = true; } catch {} });
    }
    log('expanded', n, 'trace disclosures');
  } catch {}
  await page.waitForTimeout(800);

  const dump = await page.evaluate(() => {
    const isBox = (cs) => {
      const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((s) => {
        const w = parseFloat(cs.getPropertyValue(`border-${s}-width`));
        const style = cs.getPropertyValue(`border-${s}-style`);
        return w > 0 && style !== 'none';
      });
      const bg = cs.getPropertyValue('background-color');
      const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const radius = parseFloat(cs.getPropertyValue('border-top-left-radius')) || 0;
      const shadow = cs.getPropertyValue('box-shadow');
      const hasShadow = shadow && shadow !== 'none';
      return { hasBorder, hasBg, bg: hasBg ? bg : '', radius, hasShadow, shadow: hasShadow ? shadow : '' };
    };
    const isCollapse = (el) => {
      const t = (el.textContent ?? '').trim();
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') ?? '';
      const aria = el.getAttribute('aria-expanded');
      const expandTxt = /\bexpand\b|\bcollapse\b|\+\d+\s*lines|show (more|all|less)|\bmore\b/i.test(t.slice(0, 80));
      return (tag === 'summary' || tag === 'details' || aria !== null || /button/.test(role) && expandTxt || (expandTxt && t.length < 60));
    };
    const injected = /\(In progress[—-]|delegation output truncated|awaiting/i;

    // Find the assistant turn root. Prefer assistant-turn testid; fall back.
    const roots = Array.from(document.querySelectorAll(
      '[data-testid="assistant-turn"], [data-testid^="msg-execution-projected-assistant"], [data-testid="transcript-pane"] [data-role="assistant"]'
    ));
    const pane = document.querySelector('[data-testid="transcript-pane"]');
    let root = roots[0];
    if (!root && pane) {
      // pick the last assistant-ish message wrapper
      const msgs = pane.querySelectorAll('.trx-msg, [class*="trx-msg"]');
      root = msgs[msgs.length - 1] ?? pane;
    }
    if (!root) root = document.body;

    const lines = [];
    const inj = [];
    const walk = (el, depth) => {
      if (depth > 14) return;
      const cs = getComputedStyle(el);
      const box = isBox(cs);
      const cls = (el.getAttribute('class') ?? '').trim();
      const tid = el.getAttribute('data-testid') ?? '';
      const tag = el.tagName.toLowerCase();
      const collapse = isCollapse(el);
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim().slice(0, 50);
      if (injected.test(el.textContent ?? '') && el.children.length <= 1) {
        inj.push(`${'  '.repeat(depth)}${tag}.${cls} :: "${(el.textContent ?? '').trim().slice(0, 70)}"`);
      }
      const flags = [];
      if (box.hasBorder) flags.push('BORDER');
      if (box.hasBg) flags.push(`BG(${box.bg})`);
      if (box.radius) flags.push(`R${box.radius}`);
      if (box.hasShadow) flags.push('SHADOW');
      if (collapse) flags.push('*COLLAPSE*');
      lines.push(`${'  '.repeat(depth)}${tag}${tid ? `#${tid}` : ''}${cls ? `.${cls.replace(/\s+/g, '.')}` : ''}${flags.length ? `  [${flags.join(' ')}]` : ''}${ownText ? `  "${ownText}"` : ''}`);
      for (const c of Array.from(el.children)) walk(c, depth + 1);
    };
    walk(root, 0);
    return {
      rootTestid: root.getAttribute('data-testid') ?? '(none)',
      rootClass: root.getAttribute('class') ?? '',
      tree: lines.join('\n'),
      injected: inj,
      counts: {
        assistantTurn: document.querySelectorAll('[data-testid="assistant-turn"]').length,
        cxTrace: document.querySelectorAll('[data-testid="conversation-execution-trace"]').length,
        cxRows: document.querySelectorAll('[data-testid="cx-trace-row"]').length,
        executionTree: document.querySelectorAll('[class*="execution-tree"]').length,
        trxMsg: document.querySelectorAll('.trx-msg, [class*="trx-msg"]').length,
      },
    };
  });

  const out = [
    `ROOT testid=${dump.rootTestid} class="${dump.rootClass}"`,
    `COUNTS ${JSON.stringify(dump.counts)}`,
    `INJECTED LINES (${dump.injected.length}):`,
    ...dump.injected,
    '',
    'TREE:',
    dump.tree,
  ].join('\n');
  writeFileSync(OUT, out);
  log('wrote', OUT, 'len', out.length);
  console.log('\n===== DOM DUMP =====\n' + out.slice(0, 14000));

  await page.screenshot({ path: resolve(SHOT_DIR, 'web-flat-probe.png'), fullPage: false });
  await browser.close();
}
main().catch((e) => { log('FATAL', e?.stack ?? e); process.exit(1); });
