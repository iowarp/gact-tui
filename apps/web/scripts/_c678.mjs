import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(() => ({
  groupHeadsWithIcon: Array.from(document.querySelectorAll('.shell-rail__grouphead'))
    .filter(h => h.querySelector('svg')).length,
  groupHeads: document.querySelectorAll('.shell-rail__grouphead').length,
  discloseButtons: document.querySelectorAll('.shell-rail__groupdisclose').length,
  showMore: Array.from(document.querySelectorAll('.shell-rail__showmore')).map(e=>e.textContent),
  version: document.querySelector('[data-testid="version-stamp"]')?.textContent,
  updateClaim: /update available/i.test(document.body.innerText),
})), null, 1));
await p.screenshot({path:'screenshots/visual-check/rail-groups.png'});
console.log('console errors:', errs.length, errs.slice(0,2));
await b.close();
