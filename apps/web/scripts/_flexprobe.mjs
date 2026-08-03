import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.getByRole('button',{name:'EarthScope LIVE headed demo',exact:true}).click();
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => {
  const main = document.querySelector('.shell__content');
  const kids = Array.from(main?.children ?? []).map(el => {
    const cs=getComputedStyle(el), r=el.getBoundingClientRect();
    return {tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,40),
      flex:cs.flex, top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height)};
  });
  const cs = main ? getComputedStyle(main) : null;
  return { mainDir: cs?.flexDirection, mainDisplay: cs?.display, kids };
}), null, 1));
await b.close();
