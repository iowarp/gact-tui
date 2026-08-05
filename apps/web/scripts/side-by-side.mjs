/**
 * Visual-first review instrument: capture the SAME state from the prototype
 * (:4399) and the app (:4191), stitch them into one composite (prototype on
 * top, app below, thin separator), and write it to screenshots/side-by-side/.
 *
 * UI compliance is judged on these composites BY EYE — green tests are
 * regression locks, never evidence (owner standard, 2026-08-04).
 *
 * Usage: node scripts/side-by-side.mjs <name> <setup>
 *   setup: none | session | obs | obs-gantt | fresh | menus-session |
 *          files | artifacts | context | console | search | new-dialog |
 *          execute-menu | model-picker | update-panel | settings |
 *          settings-<page-label> (e.g. settings-appearance, settings-about,
 *          settings-providers — any settings nav label, lowercased/hyphenated)
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

/** Observability fans out to several endpoints against the real live backend
 *  (agents/tasks/mcp-servers/context/agent-tasks/artifacts); how long that
 *  takes varies a lot by which session happens to be selected (a running
 *  session with a large transcript is much slower than an idle short one) —
 *  wait for the "Loading observability…" notice to actually clear rather
 *  than guessing a fixed delay. */
async function waitForObservabilityLoaded(p) {
  await p
    .getByText('Loading observability…')
    .waitFor({ state: 'detached', timeout: 15000 })
    .catch(() => {});
  await p.waitForTimeout(400);
}

async function selectAppSession(p) {
  await p.locator('.shell-rail__session').first().click();
  // The live backend's session count varies run to run (including
  // occasional empty "untitled session" rows from other in-flight work) and
  // the composer's provider/model catalogue fan-out competes for the same
  // connections, so a fixed short wait is flaky — wait for the transcript's
  // OWN loading notice to clear instead, with a generous cap.
  await p
    .locator('.sessionview__notice', { hasText: 'Loading' })
    .waitFor({ state: 'detached', timeout: 10000 })
    .catch(() => {});
  await p.waitForTimeout(400);
}

async function clickPrototypeText(p, label) {
  await p.evaluate((wanted) => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim().toLowerCase() === wanted.toLowerCase(),
    );
    button?.click();
  }, label);
}

/** Same, but matches a PREFIX — for pills that carry a live count/percent
 *  suffix in their own text ("artifacts 5", "ctx 41%"), where exact-text
 *  matching never hits. */
async function clickPrototypeTextPrefix(p, label) {
  await p.evaluate((wanted) => {
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      (candidate.textContent?.trim().toLowerCase() ?? '').startsWith(wanted.toLowerCase()),
    );
    button?.click();
  }, label);
}

/** Open the settings overlay in the prototype: the leftmost cell of the rail
 * footer's 41px/129px/129px grid band (verified in scripts/_gearprobe.mjs). */
async function openPrototypeSettings(p) {
  await p.evaluate(() => {
    const band = Array.from(document.querySelectorAll('*')).find(
      (el) => getComputedStyle(el).gridTemplateColumns === '41px 129px 129px',
    );
    band?.children[0]?.click();
  });
  await p.waitForTimeout(700);
}

async function openAppSettings(p) {
  await selectAppSession(p);
  await p.getByRole('button', { name: 'Settings' }).click();
  await p.waitForTimeout(700);
}

/** Click a settings nav item by its visible label — the prototype's
 * `settingsNav` buttons and the app's MasterDetail rail buttons both render
 * the page label as plain button text, so one selector works on both. */
async function clickSettingsNavLabel(p, label) {
  await p.evaluate((wanted) => {
    const norm = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const target = norm(wanted);
    const button = [...document.querySelectorAll('nav button')].find(
      (candidate) => norm(candidate.textContent) === target,
    );
    button?.click();
  }, label);
  await p.waitForTimeout(500);
}

/** Opens observability then clicks a tab by its label prefix (the badge
 *  count rides after it on both sides, so an exact match never hits). */
function obsSubTabSetup(tabLabel) {
  return {
    proto: async (p) => {
      await p.mouse.click(1407, 32);
      await p.waitForTimeout(1000);
      await p.evaluate((label) => {
        const b = [...document.querySelectorAll('button')].find((x) =>
          (x.textContent || '').trim().toLowerCase().startsWith(label),
        );
        b?.click();
      }, tabLabel);
      await p.waitForTimeout(800);
    },
    app: async (p) => {
      await p.locator('.shell-rail__session').first().click();
      await p.waitForTimeout(1000);
      await p.getByRole('button', { name: /observability/i }).click();
      await waitForObservabilityLoaded(p);
      await p
        .getByRole('tab', { name: new RegExp(`^${tabLabel}`, 'i') })
        .click()
        .catch(() => {});
      await p.waitForTimeout(800);
    },
  };
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
      await waitForObservabilityLoaded(p);
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
      await waitForObservabilityLoaded(p);
      await p.getByRole('button', { name: /^gantt$/i }).click().catch(() => {});
      await p.waitForTimeout(800);
    },
  },
  'obs-runs': obsSubTabSetup('runs'),
  'obs-tools': obsSubTabSetup('tools'),
  'obs-context': obsSubTabSetup('context'),
  'obs-artifacts-tab': obsSubTabSetup('artifacts'),
  fresh: {
    // The prototype's own default landing session is one of its canned demo
    // transcripts — reaching its true idle/"New session" screen means going
    // through +new like a real user would, not just loading the root state.
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
    // The app's rail "+" opens the +new dialog rather than creating instantly
    // (owner-review-1) — submit it the same way a user would to reach the
    // same idle/empty-composer state on this side.
    app: async (p) => {
      await p.getByRole('button', { name: /new session/i }).click().catch(() => {});
      await p.waitForTimeout(400);
      await p.getByRole('button', { name: /create session/i }).click().catch(() => {});
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
      await selectAppSession(p);
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
  files: {
    proto: async (p) => { await clickPrototypeText(p, 'files'); await p.waitForTimeout(800); },
    app: async (p) => { await selectAppSession(p); await p.getByRole('button', { name: 'files' }).click(); await p.waitForTimeout(2200); },
  },
  artifacts: {
    proto: async (p) => { await clickPrototypeTextPrefix(p, 'artifacts'); await p.waitForTimeout(800); },
    // The observability layer's Promise.all fans out to several endpoints
    // against a real backend — 900ms is enough for a mocked test but leaves
    // the layer on "Loading observability…" here.
    app: async (p) => { await selectAppSession(p); await p.getByRole('button', { name: 'artifacts' }).click(); await p.waitForTimeout(2500); },
  },
  context: {
    proto: async (p) => { await clickPrototypeTextPrefix(p, 'ctx'); await p.waitForTimeout(800); },
    // Scoped to the topbar: the composer also renders its own "ctx N%" chip
    // (a real, separate deep-link into the same layer), which a page-wide
    // name:'ctx' match resolves ambiguously against.
    app: async (p) => { await selectAppSession(p); await p.getByRole('banner').getByRole('button', { name: 'ctx' }).click(); await p.waitForTimeout(2500); },
  },
  console: {
    proto: async (p) => { await p.locator('button[title^="Workspace console"]').click(); await p.waitForTimeout(800); },
    app: async (p) => {
      await p.addInitScript(() => { window.isTauri = true; });
      await p.reload();
      await p.getByRole('navigation', { name: /workspaces/i }).waitFor();
      await selectAppSession(p);
      await p.getByRole('button', { name: 'console' }).click();
      await p.waitForTimeout(800);
    },
  },
  search: {
    proto: async (p) => { await p.locator('button[title="Search sessions and workspaces"]').click(); await p.waitForTimeout(600); },
    app: async (p) => { await p.getByRole('button', { name: /search sessions/i }).click(); await p.waitForTimeout(600); },
  },
  'new-dialog': {
    proto: async (p) => { await p.mouse.click(278, 85); await p.waitForTimeout(600); },
    app: async (p) => { await p.getByRole('button', { name: /new session/i }).click(); await p.waitForTimeout(600); },
  },
  'execute-menu': {
    proto: async (p) => { await clickPrototypeText(p, 'execute'); await p.waitForTimeout(600); },
    app: async (p) => { await selectAppSession(p); await p.getByRole('button', { name: 'Execute' }).click(); await p.waitForTimeout(600); },
  },
  'model-picker': {
    proto: async (p) => {
      await p.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find((candidate) => /claude|sonnet|opus/i.test(candidate.textContent || '') && candidate.getBoundingClientRect().y > 700);
        button?.click();
      });
      await p.waitForTimeout(700);
    },
    app: async (p) => { await selectAppSession(p); await p.getByRole('combobox', { name: /model/i }).click(); await p.waitForTimeout(700); },
  },
  'update-panel': {
    proto: async (p) => { await p.locator('button[title="Build version — click for updates"]').click(); await p.waitForTimeout(600); },
    app: async (p) => { await p.getByTestId('version-stamp').click(); await p.waitForTimeout(600); },
  },
  settings: {
    proto: async (p) => { await openPrototypeSettings(p); },
    app: async (p) => { await openAppSettings(p); },
  },
};

/** settings-<page-label>: open settings, then pick a nav page by label
 * (e.g. `settings-appearance`, `settings-about`, `settings-agent-blueprints`
 * -> "Agent blueprints"). Built on demand so every settings page is coverable
 * without one hardcoded entry per page. */
function settingsPageSetup(pageSlug) {
  const label = pageSlug.replace(/-/g, ' ');
  return {
    proto: async (p) => {
      await openPrototypeSettings(p);
      await clickSettingsNavLabel(p, label);
    },
    app: async (p) => {
      await openAppSettings(p);
      await clickSettingsNavLabel(p, label);
    },
  };
}

const s = setup.startsWith('settings-')
  ? settingsPageSetup(setup.slice('settings-'.length))
  : (SETUPS[setup] ?? SETUPS.none);
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
