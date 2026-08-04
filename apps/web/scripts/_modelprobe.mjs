import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  const pill = document.querySelector('.scpn');
  if (!pill) return 'no pill';
  // Everything interactive inside the composer pill, in document order.
  return Array.from(pill.querySelectorAll('button,select,[role="button"]')).map(el => {
    const cs=getComputedStyle(el), r=el.getBoundingClientRect();
    return { tag:el.tagName.toLowerCase(), text:(el.textContent||'').trim().slice(0,34),
      title: el.getAttribute('title'), cls:(el.className||'').toString().slice(0,26),
      w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.x),
      bg:cs.backgroundColor, color:cs.color, border:cs.border, radius:cs.borderRadius,
      fontSize:cs.fontSize, padding:cs.padding, gap:cs.gap };
  });
}), null, 1));
await p.screenshot({path:'screenshots/visual-check/proto-pill.png', clip:{x:280,y:770,width:900,height:130}});
await b.close();
