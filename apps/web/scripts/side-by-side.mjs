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
 *          execute-menu | model-picker | update-panel | settings | queue |
 *          async | settings-<page-label> (e.g. settings-appearance,
 *          settings-about, settings-providers — any settings nav label,
 *          lowercased/hyphenated)
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
    // The "console" topbar button is gated on useIsDesktop() -> inTauri(),
    // so spoofing window.isTauri is required to even see it. But
    // src/backend/connection.ts then routes EVERY backend fetch through
    // tauriFetch (src/tauri/tauri_http.ts), which calls
    // window.__TAURI_INTERNALS__.invoke('gact_http', ...) — real inside a
    // packaged Tauri shell, absent here, so every fetch used to throw and
    // the app's own boot probe never resolved (panels.json fix_hint,
    // 2026-08-04). Stub just that one command with a real browser fetch so
    // the rest of the app boots exactly as it does un-spoofed.
    app: async (p) => {
      await p.addInitScript(() => {
        window.isTauri = true;
        window.__TAURI_INTERNALS__ = {
          invoke: async (cmd, args) => {
            if (cmd !== 'gact_http') return null;
            const req = args?.req ?? {};
            const resp = await fetch(req.url, {
              method: req.method ?? 'GET',
              headers: req.headers ?? {},
              ...(req.body !== undefined ? { body: req.body } : {}),
            });
            const headers = {};
            resp.headers.forEach((v, k) => {
              headers[k] = v;
            });
            const body = await resp.text();
            return { status: resp.status, status_text: resp.statusText, headers, body };
          },
        };
      });
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
  // Send-while-busy message queue (mainQ). The prototype pushes straight
  // into client-side state on send, so two real sends against its own
  // default LIVE session (no backend involved at all) genuinely queue.
  // The app's queue is real too, but reaching `busy` means an in-flight
  // POST — never allowed against the shared LIVE backend per this
  // harness's read-only rule, so the two send POSTs are intercepted and
  // held open (never fulfilled, never forwarded) purely to keep the real
  // React `sending` state true long enough to capture it; the request
  // never reaches the server.
  queue: {
    proto: async (p) => {
      const send = async (text) => {
        await p.evaluate((t) => {
          const ta = document.querySelector('textarea[placeholder^="Message"]');
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value',
          ).set;
          setter.call(ta, t);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }, text);
        await p.waitForTimeout(120);
        await p.evaluate(() => {
          const ta = document.querySelector('textarea[placeholder^="Message"]');
          let el = ta;
          let btn = null;
          for (let i = 0; i < 8 && el && !btn; i += 1) {
            el = el.parentElement;
            const buttons = el ? [...el.querySelectorAll('button')] : [];
            if (buttons.length >= 4) btn = buttons[buttons.length - 1];
          }
          btn?.click();
        });
        await p.waitForTimeout(250);
      };
      await send('first queued message for review');
      await send('second queued message for review');
      await p.waitForTimeout(300);
    },
    app: async (p) => {
      // GETs (loading the session list/detail) pass through untouched; only
      // the two real mutations `send()` makes (PATCH the mode, POST the
      // message) are held open forever — never fulfilled, never forwarded —
      // so the real backend never sees them.
      await p.route(/\/v1\/sessions\/[^/]+(\/messages)?$/, (route) => {
        const method = route.request().method();
        if (method === 'PATCH' || method === 'POST') return;
        return route.continue();
      });
      await selectAppSession(p);
      const box = p.getByRole('textbox', { name: 'Message' });
      const send = p.getByRole('button', { name: /send message|queue for the next step boundary/i });
      // Unlike the prototype's canned demo session (already mid-step before
      // the first send), a real session here starts idle — its OWN first
      // send is what makes `busy` true (the in-flight, intercepted POST).
      // Only the sends AFTER that one queue, so three sends are needed to
      // land two queued rows comparable to the prototype's two-row capture.
      await box.fill('turn already sending, held open for this capture');
      await send.click();
      await p.waitForTimeout(300);
      await box.fill('first queued message for review');
      await send.click();
      await p.waitForTimeout(300);
      await box.fill('second queued message for review');
      await send.click();
      await p.waitForTimeout(500);
    },
  },
  // The composer's async chip + runs popover (composer-pill.json). The
  // prototype's own popover data is entirely client-local canned state
  // (isEarth/isAst demo branches), reached just by clicking the chip on its
  // default session — but the read-only shared LIVE backend this harness
  // points at currently carries zero non-terminal agent-tasks, so the app's
  // OWN chip never shows (asyncCount stays 0, the chip doesn't render at
  // all). Route-intercept ONLY the GET .../agent-tasks response with canned
  // rows shaped like the prototype's own demo set (gnss-region-watch 2h14m,
  // catalog-refresh 12m, one recently-finished row) — no session/message
  // mutation, nothing forwarded to the real server, same technique as the
  // `queue` setup's held-open POSTs above.
  async: {
    proto: async (p) => { await clickPrototypeTextPrefix(p, 'async'); await p.waitForTimeout(800); },
    app: async (p) => {
      const now = Date.now();
      await p.route(/\/v1\/sessions\/[^/]+\/agent-tasks(\?.*)?$/, (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            tasks: [
              {
                task_id: 'review-watch-1',
                status: 'running',
                run_label: 'gnss-region-watch',
                host: 'detached',
                created_at: new Date(now - (2 * 60 + 14) * 60_000).toISOString(),
              },
              {
                task_id: 'review-catalog-1',
                status: 'running',
                run_label: 'catalog-refresh',
                host: 'parallel',
                created_at: new Date(now - 12 * 60_000).toISOString(),
              },
              {
                task_id: 'review-done-1',
                status: 'completed',
                run_label: 'station-inventory-sync',
                created_at: new Date(now - 40 * 60_000).toISOString(),
                completed_at: new Date(now - 26 * 60_000).toISOString(),
              },
            ],
          }),
        }),
      );
      await selectAppSession(p);
      await p.getByRole('button', { name: /^async \d+$/ }).click();
      await p.waitForTimeout(700);
    },
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
