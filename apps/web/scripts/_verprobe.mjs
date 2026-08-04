import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  const leaf = Array.from(document.querySelectorAll('*')).find(el =>
    (el.textContent||'').trim() === 'update available' && el.children.length === 0);
  if (!leaf) return 'not found';
  const rows = [];
  let el = leaf;
  for (let i=0;i<3 && el;i+=1) {
    const cs=getComputedStyle(el), r=el.getBoundingClientRect();
    rows.push({ tag:el.tagName.toLowerCase(), text:(el.textContent||'').trim().slice(0,60),
      display:cs.display, gap:cs.gap, fontSize:cs.fontSize, color:cs.color, padding:cs.padding,
      position:cs.position, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) });
    el = el.parentElement;
  }
  return rows;
}), null, 1));
await b.close();
