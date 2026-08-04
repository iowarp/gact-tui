import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  // The leftmost cell of the 41px/129px/129px footer grid.
  const band = Array.from(document.querySelectorAll('*')).find(el =>
    getComputedStyle(el).gridTemplateColumns === '41px 129px 129px');
  if (!band) return 'band not found';
  const cell = band.children[0];
  const cs = getComputedStyle(cell), r = cell.getBoundingClientRect();
  const svg = cell.querySelector('svg');
  const sr = svg?.getBoundingClientRect();
  return { bandCols: getComputedStyle(band).gridTemplateColumns,
    cell:{ tag:cell.tagName.toLowerCase(), padding:cs.padding, w:Math.round(r.width), h:Math.round(r.height),
      justify:cs.justifyContent, minWidth:cs.minWidth },
    svg: sr ? { w:Math.round(sr.width), h:Math.round(sr.height),
      viewBox: svg.getAttribute('viewBox'), attrW: svg.getAttribute('width') } : null };
}), null, 1));
await b.close();
