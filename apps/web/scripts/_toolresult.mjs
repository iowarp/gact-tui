import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:1000}, colorScheme:'dark' });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.getByRole('button',{name:'thinking-experiment',exact:true}).click();
await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => {
  const results = Array.from(document.querySelectorAll('.part-toolresult'));
  return {
    toolResultFrames: results.length,
    renderedAsRecorded: results.filter(e => e.textContent?.trim() === 'recorded').length,
    samples: results.slice(0,3).map(e => (e.textContent||'').trim().slice(0,70)),
  };
}), null, 1));
console.log('console errors:', errs.length);
await b.close();
