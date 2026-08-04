import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.getByRole('button',{name:'thinking-experiment',exact:true}).click();
await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => ({
  agentsFooter: document.querySelectorAll('.shell-rail__footcell')[1]?.textContent?.trim(),
  model: document.querySelector('[data-testid="composer-model"]')?.textContent?.trim(),
  approval: document.querySelector('[data-testid="composer-approval"]')?.textContent?.trim(),
  attach: !!document.querySelector('.composer__attach[data-unbacked="true"]'),
})), null, 1));
await p.screenshot({path:'screenshots/visual-check/control-row.png', clip:{x:300,y:760,width:1140,height:140}});
console.log('console errors:', errs.length, errs.slice(0,2));
await b.close();
