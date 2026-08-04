import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  const hit = Array.from(document.querySelectorAll('*')).filter(el =>
    /agents\s*\d+|relay/i.test((el.textContent||'')) && el.children.length <= 2);
  return hit.slice(0,8).map(el => {
    const cs=getComputedStyle(el), r=el.getBoundingClientRect();
    const pcs = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const pr = el.parentElement?.getBoundingClientRect();
    return { tag:el.tagName.toLowerCase(), text:(el.textContent||'').trim().slice(0,26),
      display:cs.display, justifyContent:cs.justifyContent, alignItems:cs.alignItems,
      textAlign:cs.textAlign, padding:cs.padding, gap:cs.gap,
      w:Math.round(r.width), x:Math.round(r.x), bottom:Math.round(r.bottom),
      parent:{ display:pcs?.display, cols:pcs?.gridTemplateColumns, justify:pcs?.justifyContent,
        w:pr?Math.round(pr.width):null } };
  });
}), null, 1));
await b.close();
