import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  const out = { pathRows: [], versionish: [] };
  for (const el of document.querySelectorAll('div,button,span')) {
    const r = el.getBoundingClientRect();
    const t = (el.textContent||'').trim();
    if (r.left < 300 && r.width > 120 && /^[~/]/.test(t) && t.length < 40 && el.children.length <= 4) {
      const cs = getComputedStyle(el);
      out.pathRows.push({ tag:el.tagName.toLowerCase(), text:t.slice(0,36), svgs:el.querySelectorAll('svg').length,
        display:cs.display, gap:cs.gap, padding:cs.padding, fontSize:cs.fontSize, color:cs.color,
        fontFamily:cs.fontFamily.slice(0,20), h:Math.round(r.height), w:Math.round(r.width),
        svgHtml: Array.from(el.querySelectorAll('svg')).map(s=>s.outerHTML.slice(0,150)) });
    }
    if (/update available|v0\.|\+g[0-9a-f]{4,}/i.test(t) && el.children.length === 0) {
      const cs = getComputedStyle(el);
      out.versionish.push({ text:t.slice(0,60), fontSize:cs.fontSize, color:cs.color,
        x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width) });
    }
  }
  out.pathRows = out.pathRows.slice(0,3);
  return out;
}), null, 1));
await b.close();
