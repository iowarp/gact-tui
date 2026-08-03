import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.getByRole('button',{name:'EarthScope LIVE headed demo',exact:true}).click();
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { error:'no textarea' };
  const out=[]; let el=ta;
  for (let i=0;i<7&&el;i+=1){
    const cs=getComputedStyle(el), rc=el.getBoundingClientRect();
    out.push({tag:el.tagName.toLowerCase(),cls:(el.className||'').toString().slice(0,38),
      position:cs.position,display:cs.display,flex:cs.flex,overflowY:cs.overflowY,
      minHeight:cs.minHeight,height:Math.round(rc.height),rectBottom:Math.round(rc.bottom),
      padding:cs.padding,maxWidth:cs.maxWidth,borderRadius:cs.borderRadius});
    el=el.parentElement;
  }
  return {viewportH:window.innerHeight, docH:document.documentElement.scrollHeight, chain:out};
});
console.log(JSON.stringify(r,null,1));
await p.screenshot({path:'screenshots/visual-check/app-composer.png'});
await b.close();
