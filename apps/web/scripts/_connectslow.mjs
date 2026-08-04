import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900}, colorScheme:'dark' });
const p = await ctx.newPage();
// Seed two saved backends so the list renders.
await p.addInitScript(() => {
  localStorage.setItem('clio.backends.v3', JSON.stringify({
    backends: [
      { id:'b1', label:'local', url:'http://127.0.0.1:17900' },
      { id:'b2', label:'ares', url:'http://127.0.0.1:19999' },
    ], currentId: null,
  }));
});
await p.goto('http://127.0.0.1:4191/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(600);
console.log('saved list rendered:', await p.locator('.connect__saved li').count());

// Stall the probe so the pending state is observable.
await p.route('**/v1/capabilities*', async r => { await new Promise(s=>setTimeout(s,3000)); await r.abort(); });
await p.getByTestId('connect-url').fill('http://127.0.0.1:19999');
await p.getByTestId('connect-submit').click();
await p.waitForTimeout(700);
const r = await p.evaluate(() => ({
  progress: !!document.querySelector('[data-testid="connect-progress"]'),
  busy: document.querySelector('[data-testid="connect-screen"]')?.getAttribute('aria-busy'),
  status: document.querySelector('.connect__status')?.textContent?.trim(),
  barAnimated: (() => {
    const el = document.querySelector('.connect__progressbar');
    return el ? getComputedStyle(el).animationName : null;
  })(),
}));
console.log(JSON.stringify(r, null, 1));
await p.screenshot({path:'screenshots/visual-check/connect-screen.png'});
await b.close();
