/**
 * Visual-first review instrument: capture the SAME state from the prototype
 * (:4399) and the app (:4191), stitch them into one composite (prototype on
 * top, app below, thin separator), and write it to screenshots/side-by-side/.
 *
 * UI compliance is judged on these composites BY EYE — green tests are
 * regression locks, never evidence (owner standard, 2026-08-04).
 *
 * Usage: node scripts/side-by-side.mjs <name> <setup>
 *   setup: none | session | obs | obs-gantt | fresh | menus-session
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const PROTO = 'http://127.0.0.1:4399/Clio%20Session.html';
const APP = process.env.PREVIEW ?? 'http://localhost:4191';
const BACKEND = process.env.BACKEND ?? 'http://127.0.0.1:17900';
const name = process.argv[2] ?? 'compare';
const setup = process.argv[3] ?? 'session';

const OUT = 'screenshots/side-by-side';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function protoPage() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await p.goto(PROTO, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  return p;
}

async function appPage() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await p.addInitScript(
    ([backend]) => {
      try {
        localStorage.setItem(
          'clio.backends.v3',
          JSON.stringify({
            backends: [{ id: backend, label: 'review', url: backend, bearerToken: '', kind: 'http' }],
            currentId: backend,
          }),
        );
        localStorage.setItem('clio.backend.last-url.v3', backend);
      } catch {
        /* cold path then */
      }
    },
    [BACKEND],
  );
  await p.goto(APP);
  await p.getByRole('navigation', { name: /workspaces/i }).waitFor({ timeout: 30000 });
  return p;
}

/** Per-state setup on each side. Extend as review states grow. */
const SETUPS = {
  none: { proto: async () => {}, app: async () => {} },
  session: {
    proto: async () => {},
    app: async (p) => {
      await p.locator('.shell-rail__session').first().click();
      await p.waitForSelector('.transcript__message', { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(800);
    },
  },
  obs: {
    proto: async (p) => {
      await p.mouse.click(1407, 32);
      await p.waitForTimeout(1000);
    },
    app: async (p) => {
      await p.locator('.shell-rail__session').first().click();
      await p.waitForTimeout(1000);
      await p.getByRole('button', { name: /observability/i }).click();
      await p.waitForTimeout(1200);
    },
  },
  'obs-gantt': {
    proto: async (p) => {
      await p.mouse.click(1407, 32);
      await p.waitForTimeout(1000);
      await p.evaluate(() => {
        const g = [...document.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === 'gantt',
        );
        g?.click();
      });
      await p.waitForTimeout(800);
    },
    app: async (p) => {
      await p.locator('.shell-rail__session').first().click();
      await p.waitForTimeout(1000);
      await p.getByRole('button', { name: /observability/i }).click();
      await p.waitForTimeout(1000);
      await p.getByRole('button', { name: /^gantt$/i }).click().catch(() => {});
      await p.waitForTimeout(800);
    },
  },
  fresh: {
    proto: async (p) => {
      await p.mouse.click(278, 85);
      await p.waitForTimeout(700);
      await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) =>
          /create session/i.test(x.textContent || ''),
        );
        b?.click();
      });
      await p.waitForTimeout(1200);
    },
    app: async (p) => {
      await p.getByRole('button', { name: /new session/i }).click().catch(() => {});
      await p.waitForTimeout(1200);
    },
  },
  'ask-menu': {
    proto: async (p) => {
      await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(
          (x) => x.textContent?.trim().toLowerCase() === 'ask',
        );
        b?.click();
      });
      await p.waitForTimeout(700);
    },
    app: async (p) => {
      await p.locator('.shell-rail__session').first().click();
      await p.waitForTimeout(900);
      await p.getByTestId('composer-approval').click();
      await p.waitForTimeout(700);
    },
  },
  'menus-session': {
    proto: async (p) => {
      await p.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.x < 300 && r.width <= 20 && r.width > 8 && Math.abs(r.y + r.height / 2 - 184) < 14;
        });
        btns[btns.length - 1]?.click();
      });
      await p.waitForTimeout(700);
    },
    app: async (p) => {
      const row = p.locator('.shell-rail__session').first();
      await row.hover();
      await row.getByRole('button', { name: /session menu/i }).click();
      await p.waitForTimeout(700);
    },
  },
};

const s = SETUPS[setup] ?? SETUPS.none;
const [pp, ap] = [await protoPage(), await appPage()];
await s.proto(pp);
await s.app(ap);
const protoShot = path.join(OUT, `${name}-proto.png`);
const appShot = path.join(OUT, `${name}-app.png`);
await pp.screenshot({ path: protoShot });
await ap.screenshot({ path: appShot });
await browser.close();

// Stitch: prototype on top, app below, 4px separator.
const a = PNG.sync.read(fs.readFileSync(protoShot));
const b = PNG.sync.read(fs.readFileSync(appShot));
const w = Math.max(a.width, b.width);
const sep = 4;
const out = new PNG({ width: w, height: a.height + sep + b.height });
out.data.fill(255);
PNG.bitblt(a, out, 0, 0, a.width, a.height, 0, 0);
PNG.bitblt(b, out, 0, 0, b.width, b.height, 0, a.height + sep);
const outPath = path.join(OUT, `${name}.png`);
fs.writeFileSync(outPath, PNG.sync.write(out));
console.log(outPath);
