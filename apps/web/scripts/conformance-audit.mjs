/**
 * Measured conformance audit: prototype vs current build.
 *
 * Walks the rail, topbar, ribbon and composer regions of BOTH pages and dumps
 * per-element computed style + geometry records, so divergence is a diff over
 * measurements — not an eyeball pass. The prototype's class names are minified
 * template DSL, so elements are matched by region + role, never by class.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const PROTO = 'http://127.0.0.1:4399/bundled.html';
const APP = process.env.PREVIEW ?? 'http://127.0.0.1:4191';
const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:17900';

/** Serialize every visible element in a region with the styles that matter. */
const DUMP = (regionFilter) => `
(() => {
  const within = ${regionFilter};
  const out = [];
  const walk = (el) => {
    for (const child of el.children) walk(child);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (!within(r)) return;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return;
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ');
    const isSvg = el.tagName.toLowerCase() === 'svg';
    // Only rows that carry their own text, an svg, or a background/border are
    // interesting; pure layout wrappers are noise.
    const hasChrome =
      s.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      s.borderTopWidth !== '0px' || s.borderRadius !== '0px';
    if (!ownText && !isSvg && !hasChrome) return;
    out.push({
      tag: el.tagName.toLowerCase(),
      text: ownText.slice(0, 60),
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      font: s.fontFamily.split(',')[0].replace(/"/g, ''),
      size: s.fontSize, weight: s.fontWeight,
      color: s.color,
      bg: s.backgroundColor === 'rgba(0, 0, 0, 0)' ? null : s.backgroundColor,
      radius: s.borderRadius === '0px' ? null : s.borderRadius,
      letterSpacing: s.letterSpacing === 'normal' ? null : s.letterSpacing,
      transform: s.textTransform === 'none' ? null : s.textTransform,
      opacity: s.opacity === '1' ? null : s.opacity,
      pad: s.padding === '0px' ? null : s.padding,
      gap: s.gap === 'normal' ? null : s.gap,
      align: s.alignItems === 'normal' ? null : s.alignItems,
      svg: isSvg
        ? { vb: el.getAttribute('viewBox'), d: [...el.querySelectorAll('path')].map((p) => (p.getAttribute('d') || '').slice(0, 40)) }
        : null,
    });
  };
  walk(document.body);
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
})()
`;

const RAIL = '(r) => r.x < 300 && r.width < 300';
const TOP = '(r) => r.x >= 300 && r.y < 110';
const COMPOSER = '(r) => r.y > 700 && r.x >= 300';

const browser = await chromium.launch();

async function dump(url, prepare, label) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await prepare?.(page);
  await page.waitForTimeout(2500);
  const result = {
    rail: await page.evaluate(DUMP(RAIL)),
    topbar: await page.evaluate(DUMP(TOP)),
    composer: await page.evaluate(DUMP(COMPOSER)),
  };
  writeFileSync(`screenshots/visual-check/audit-${label}.json`, JSON.stringify(result, null, 1));
  console.log(`${label}: rail=${result.rail.length} topbar=${result.topbar.length} composer=${result.composer.length}`);
  await page.close();
}

await dump(PROTO, null, 'proto');
await dump(
  APP,
  async (page) => {
    const url = page.getByTestId('connect-url');
    if (await url.count()) {
      await url.fill(BACKEND);
      await page.getByTestId('connect-submit').click();
    }
    await page.getByRole('navigation', { name: /workspaces/i }).waitFor({ timeout: 30000 });
    // Open a session so the composer + topbar carry real content, as the
    // prototype render does.
    await page.locator('.shell-rail__session').first().click();
  },
  'app',
);

await browser.close();
console.log('wrote screenshots/visual-check/audit-{proto,app}.json');
