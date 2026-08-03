import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, colorScheme:'dark' });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://127.0.0.1:4191/',{waitUntil:'networkidle'});
await p.getByTestId('connect-url').fill('http://127.0.0.1:17900');
await p.getByTestId('connect-submit').click();
await p.getByRole('navigation',{name:/workspaces/i}).waitFor({timeout:20000});
for (const name of ['EarthScope LIVE headed demo','thinking-experiment','881 capture happy path']) {
  await p.getByRole('button',{name,exact:true}).click();
  await p.waitForTimeout(2200);
  const r = await p.evaluate(() => {
    const err = document.querySelector('.sessionview__error');
    const c = document.querySelector('.composer')?.getBoundingClientRect();
    const t = document.querySelector('.transcript')?.getBoundingClientRect();
    return { error: err?.textContent?.trim().slice(0,110) ?? null,
      composerBottom: c ? Math.round(c.bottom) : null, composerW: c ? Math.round(c.width) : null,
      transcriptH: t ? Math.round(t.height) : null };
  });
  console.log(name.padEnd(30), JSON.stringify(r));
}
console.log('pageerrors:', errs.length, errs.slice(0,2));
await p.screenshot({path:'screenshots/visual-check/composer-pinned.png'});
await b.close();
