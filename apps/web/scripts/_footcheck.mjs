import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(() => {
  const band = document.querySelector('.shell-rail__foot');
  return Array.from(document.querySelectorAll('.shell-rail__footcell')).map(el => {
    const cs=getComputedStyle(el), r=el.getBoundingClientRect();
    // Is the ink actually centred in the cell?
    const kids = Array.from(el.childNodes).filter(n=>n.nodeType===1);
    const ink = kids.length ? {
      left: Math.round(Math.min(...kids.map(k=>k.getBoundingClientRect().left)) - r.left),
      right: Math.round(r.right - Math.max(...kids.map(k=>k.getBoundingClientRect().right))),
    } : null;
    return { text:(el.textContent||'').trim().slice(0,20), justifyContent:cs.justifyContent,
      textAlign:cs.textAlign, padding:cs.padding, gap:cs.gap, w:Math.round(r.width), ink };
  }).concat([{ band: band ? getComputedStyle(band).gridTemplateColumns : 'none' }]);
}), null, 1));
await p.screenshot({path:'screenshots/visual-check/rail-foot.png', clip:{x:0,y:820,width:320,height:80}});
await b.close();
