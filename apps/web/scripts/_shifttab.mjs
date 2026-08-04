import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
const snap = async (tag) => {
  const r = await p.evaluate(() => {
    const pill = document.querySelector('.scpn');
    const ta = document.querySelector('textarea');
    return {
      pillH: pill ? Math.round(pill.getBoundingClientRect().height) : null,
      taH: ta ? Math.round(ta.getBoundingClientRect().height) : null,
      taRows: ta?.rows, pillText: (pill?.textContent||'').replace(/\s+/g,' ').trim().slice(0,120),
      pillCls: pill?.className,
    };
  });
  console.log(tag, JSON.stringify(r));
};
await snap('before ');
await p.locator('textarea').focus();
await p.keyboard.press('Shift+Tab');
await p.waitForTimeout(600);
await snap('after 1');
await p.keyboard.press('Shift+Tab');
await p.waitForTimeout(600);
await snap('after 2');
await b.close();
