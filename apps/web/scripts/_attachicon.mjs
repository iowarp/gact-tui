import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
await p.goto('http://127.0.0.1:4399/bundled.html',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
console.log(await p.evaluate(() => {
  const btn = document.querySelector('.scpn [title="Attach"]');
  if (!btn) return 'not found';
  const svg = btn.querySelector('svg');
  return svg ? svg.outerHTML : 'no svg; textContent=' + JSON.stringify(btn.textContent);
}));
await b.close();
