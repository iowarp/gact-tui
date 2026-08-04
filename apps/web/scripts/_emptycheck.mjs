import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.waitForTimeout(1500);

const r = await p.evaluate(() => {
  const c = document.querySelector('.composer')?.getBoundingClientRect();
  const ta = document.querySelector('textarea');
  return {
    debugString: /select a session/i.test(document.body.innerText),
    composerPresent: !!c, composerBottom: c ? Math.round(c.bottom) : null,
    textareaEnabled: ta ? !ta.disabled : false,
  };
});
console.log('default view:', JSON.stringify(r));
await p.screenshot({path:'screenshots/visual-check/empty-default.png'});
console.log('console errors:', errs.length, errs.slice(0,2));
await b.close();
