/**
 * Measure the prototype's composer geometry (C3).
 *
 * The owner's complaint is that our pill sits at the bottom of the TEXT
 * rather than the bottom of the SCREEN. Rather than read 8.5 MB of bundled
 * template, measure the real thing: find the composer textarea, walk its
 * ancestors, and report the positioning that actually holds it in place.
 */
import { chromium } from '@playwright/test';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:4399/bundled.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const report = await p.evaluate(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { error: 'no textarea in prototype' };

  const chain = [];
  let el = ta;
  for (let i = 0; i < 8 && el; i += 1) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 40),
      position: cs.position,
      bottom: cs.bottom,
      left: cs.left,
      right: cs.right,
      zIndex: cs.zIndex,
      display: cs.display,
      padding: cs.padding,
      margin: cs.margin,
      maxWidth: cs.maxWidth,
      width: Math.round(r.width),
      rectBottom: Math.round(r.bottom),
      borderRadius: cs.borderRadius,
      background: cs.backgroundColor,
      border: cs.border,
      boxShadow: cs.boxShadow.slice(0, 60),
      backdropFilter: cs.backdropFilter,
    });
    el = el.parentElement;
  }
  return { viewportH: window.innerHeight, chain };
});

console.log(JSON.stringify(report, null, 2));
await p.screenshot({ path: 'screenshots/visual-check/proto-composer.png' });
await b.close();
