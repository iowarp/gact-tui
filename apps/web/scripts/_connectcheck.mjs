import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900}, colorScheme:'dark' });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));

// First visit: nothing saved, so no autoconnect and no saved list.
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.waitForTimeout(800);
console.log('cold boot:', JSON.stringify(await p.evaluate(() => ({
  screen: !!document.querySelector('[data-testid="connect-screen"]'),
  savedList: !!document.querySelector('.connect__saved'),
}))));

await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
// Catch the transient connecting state.
const sawProgress = await p.locator('[data-testid="connect-progress"]').count().catch(()=>0);
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
console.log('connected; progress element seen during connect:', sawProgress > 0 || 'too fast to sample');

// Reload in the SAME context: the registry persists, so it must autoconnect.
await p.reload({waitUntil:'networkidle'});
const auto = await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000}).then(()=>true).catch(()=>false);
console.log('autoconnected on reload:', auto);
console.log('console errors:', errs.length, errs.slice(0,2));
await b.close();
