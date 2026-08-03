import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
await p.getByRole('button',{name:'thinking-experiment',exact:true}).click();
await p.waitForTimeout(900);
await p.getByRole('button',{name:'Settings'}).click();
await p.waitForTimeout(900);
const card = p.locator('.kit-layer__card');
const box = await card.boundingBox();
console.log('settings overlay:', box ? `${Math.round(box.width)}x${Math.round(box.height)} at x=${Math.round(box.x)}` : 'NOT SHOWN');
console.log('centred?        :', box ? Math.abs((box.x + box.width/2) - 720) < 20 : false);
// The doubled-header defect: the Layer owns the chrome, so exactly one
// heading and one close control may exist inside the card.
console.log('headings in card:', await card.getByRole('heading').count(), '(expect 1)');
console.log('close buttons   :', await card.getByRole('button',{name:/^close /i}).count(), '(expect 1)');
await p.screenshot({ path:'screenshots/visual-check/layer-live.png' });

await p.keyboard.press('Escape');
await p.waitForTimeout(400);
console.log('escape closes   :', (await p.locator('.kit-layer__card').count()) === 0);

await p.getByRole('button',{name:'Observability'}).click();
await p.waitForTimeout(900);
const obs = p.locator('.kit-layer__card');
const obox = await obs.boundingBox();
console.log('obs overlay     :', obox ? `${Math.round(obox.width)}x${Math.round(obox.height)} at x=${Math.round(obox.x)}` : 'NOT SHOWN');
console.log('obs headings    :', await obs.getByRole('heading').count(), '(expect 1)');
await p.screenshot({ path:'screenshots/visual-check/layer-obs-live.png' });

console.log('console errors  :', errs.length, errs.slice(0,3));
await b.close();
