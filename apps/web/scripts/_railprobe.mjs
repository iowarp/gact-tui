import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  const out = { groupRows: [], showMore: null, version: null };
  // Everything in the left 300px column, above the footer.
  const inRail = el => { const r = el.getBoundingClientRect(); return r.left < 300 && r.width > 80 && r.width < 300; };

  // Group rows: contain an svg AND a path-like label.
  for (const el of document.querySelectorAll('div,button')) {
    if (!inRail(el)) continue;
    const t = (el.textContent||'').trim();
    if (!/^[~/A-Za-z]/.test(t) || t.length > 60) continue;
    if (!el.querySelector('svg')) continue;
    if (el.children.length > 4) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    out.groupRows.push({ tag:el.tagName.toLowerCase(), text:t.slice(0,42),
      svgs: el.querySelectorAll('svg').length,
      display:cs.display, cols:cs.gridTemplateColumns, gap:cs.gap, padding:cs.padding,
      fontSize:cs.fontSize, color:cs.color, letterSpacing:cs.letterSpacing,
      textTransform:cs.textTransform, h:Math.round(r.height) });
  }
  out.groupRows = out.groupRows.slice(0, 4);

  for (const el of document.querySelectorAll('*')) {
    const t = (el.textContent||'').trim();
    if (/^show more/i.test(t) && el.children.length === 0) {
      const cs = getComputedStyle(el);
      out.showMore = { tag:el.tagName.toLowerCase(), text:t.slice(0,40), fontSize:cs.fontSize, color:cs.color, padding:cs.padding };
    }
    if (/^v\d+\.\d+/.test(t) && el.children.length === 0) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      out.version = { text:t.slice(0,50), fontSize:cs.fontSize, color:cs.color,
        x:Math.round(r.x), y:Math.round(r.y), fontFamily:cs.fontFamily.slice(0,24) };
    }
  }
  return out;
}), null, 1));
await b.close();
