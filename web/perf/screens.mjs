// One-command deterministic screenshot capture of every surface and state.
//
//   pnpm screens [--widths 1680,1280] [--themes dark,light]
//                [--only settings,canvas] [--out test-results/screens]
//                [--merge]   update an earlier manifest in --out instead of replacing it
//
// Drives the same fixture stack as the perf harness (perf/stack.mjs) with a
// frozen clock, UTC, reduced motion, disabled animations and a fixture reset
// per scenario, so two runs of one commit produce the same pixels. Writes
// <out>/<theme>/<width>/<surface>--<state>.png, screens-manifest.json and
// screens-report.md. Each light/dark capture is also scanned for large
// surfaces that kept the other theme's colors (see `themeGaps`).
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { applyScenario, startStack, webRoot } from './stack.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

const VIEWPORTS = { 1680: 1050, 1280: 800, 1024: 768, 768: 1024, 390: 844 };
const widths = option('widths', Object.keys(VIEWPORTS).join(',')).split(',').map(Number);
const themes = option('themes', 'dark,light').split(',');
const only = option('only', '');
const merge = args.includes('--merge');
const outDir = resolve(webRoot, option('out', 'test-results/screens'));
const portOffset = Number(option('port-offset', '10'));
const scale = Number(option('scale', '1'));
// The fixture's static records date from 2026-08-22; the fixture processes'
// own clock sits two minutes before the page clock so relative times read
// "2 min ago" on every run.
const FROZEN_TIME = new Date('2026-09-01T15:00:00Z');
const FIXTURE_TIME = '2026-09-01T14:58:00Z';

const SESSION = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
const HUGE = '/workspaces/ws_flat_ndp/sessions/sess_perf_huge';
const MESSAGE = '[aria-label="Conversation"] [data-message-id]';
const COMPOSER = '[role="combobox"][aria-label^="Ask "]';
const OVERLAY =
  '[role="menu"],[role="dialog"],[role="listbox"],[role="alertdialog"],[data-radix-popper-content-wrapper]';

function log(message) {
  console.log(`[screens ${new Date().toISOString().slice(11, 19)}] ${message}`);
}

// --- Interaction helpers ------------------------------------------------------

const control = (page, role, name, options = {}) =>
  page
    .getByRole(role, { name, ...options })
    .filter({ visible: true })
    .first();

/**
 * Row actions in the left bar stay hidden until their row is hovered; hover the
 * row that owns a hidden match so the action can be pressed like a person would.
 */
async function revealRowAction(page, role, name, options) {
  const matches = page.getByRole(role, { name, includeHidden: true, ...options });
  const count = Math.min(await matches.count(), 20);
  for (let index = 0; index < count; index += 1) {
    const row = matches.nth(index).locator('xpath=ancestor::*[@data-slot="list-row"][1]');
    if (!(await row.isVisible().catch(() => false))) continue;
    // Hover the trailing edge, where the actions column appears, so the pointer
    // stays on the row (and off any hover card) while the action is pressed.
    const box = await row.boundingBox();
    await row.hover(box ? { position: { x: Math.max(1, box.width - 14), y: box.height / 2 } } : {});
    await page.waitForTimeout(150);
    return true;
  }
  return false;
}

async function press(page, role, name, options) {
  const target = control(page, role, name, options);
  let visible = await target
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (!visible && (await revealRowAction(page, role, name, options))) {
    visible = await target.isVisible().catch(() => false);
  }
  if (!visible) {
    // Narrow layouts move the left bar into a sheet behind the sidebar trigger.
    const trigger = page
      .locator('button[data-sidebar="trigger"]')
      .filter({ visible: true })
      .first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await page.waitForTimeout(500);
    }
  }
  if (!(await target.isVisible().catch(() => false))) {
    await revealRowAction(page, role, name, options);
  }
  await target.waitFor({ state: 'visible', timeout: 4000 });
  await target.click();
}

async function overlay(page) {
  await page.locator(OVERLAY).filter({ visible: true }).first().waitFor({ timeout: 4000 });
  await page.waitForTimeout(250);
}

async function openCanvas(page) {
  const open = control(page, 'button', 'Open workspace canvas');
  if (await open.isVisible().catch(() => false)) {
    await open.click();
    await page.waitForTimeout(500);
  }
}

/** Show one of the workbench lists (Files, Sources, ?) from the strip. */
async function stripList(page, name) {
  await openCanvas(page);
  const item = page
    .getByRole('toolbar', { name: 'Workbench lists' })
    .getByRole('button', { name, exact: true })
    .filter({ visible: true })
    .first();
  await item.waitFor({ state: 'visible', timeout: 4000 });
  if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click();
  await page.waitForTimeout(800);
}

/** Show the Files list and open folders top-down, nested ones included. */
async function expandedFiles(page, folders) {
  await stripList(page, 'Files');
  const list = page.getByRole('region', { name: 'Files list' });
  for (let i = 0; i < folders; i += 1) {
    const folder = list.getByRole('button', { name: /^Expand folder / }).first();
    if (!(await folder.isVisible().catch(() => false))) break;
    await folder.click();
    await page.waitForTimeout(200);
  }
  await list
    .locator('[data-slot="scroll-area-viewport"]')
    .first()
    .evaluate((viewport) => viewport.scrollTo(0, 0))
    .catch(() => {});
  await page.waitForTimeout(400);
}

async function openFile(page, path, { settled = true } = {}) {
  await stripList(page, 'Files');
  const list = page.getByRole('region', { name: 'Files list' });
  const parts = path.split('/');
  for (const part of parts.slice(0, -1)) {
    const folder = list.getByRole('button', { name: `Expand folder ${part}`, exact: true });
    if (await folder.isVisible().catch(() => false)) await folder.click();
    await page.waitForTimeout(300);
  }
  await list
    .locator('[role="treeitem"]:not([aria-expanded])')
    .filter({ hasText: parts.at(-1) })
    .filter({ visible: true })
    .first()
    .click();
  if (!settled) return;
  await page
    .locator('[aria-label="Workspace file preview"]')
    .filter({ hasText: parts.at(-1) })
    .first()
    .waitFor();
  await page.waitForTimeout(800);
}

/** Wait until a visible element shows `text` (body content, not a toolbar). */
async function showsText(page, text, timeout = 15000) {
  await page.getByText(text).filter({ visible: true }).first().waitFor({ timeout });
}

async function showsAny(page, texts, timeout = 15000) {
  await Promise.any(texts.map((text) => showsText(page, text, timeout)));
}

/** Switch a viewer mode by accessible name, trying each name as a tab, radio then button. */
async function pickMode(page, names) {
  for (const name of names) {
    for (const role of ['tab', 'radio', 'button']) {
      const target = control(page, role, name, { exact: true });
      if (await target.isVisible().catch(() => false)) {
        if ((await target.getAttribute('aria-selected')) !== 'true') await target.click();
        await page.waitForTimeout(1500);
        return name;
      }
    }
  }
  // A narrow frame bar folds its modes to the active icon and a menu.
  const folded = page.locator('[data-modes-folded]').filter({ visible: true }).first();
  if (await folded.isVisible().catch(() => false)) {
    await folded.click();
    for (const name of names) {
      const item = page.getByRole('menuitemradio', { name, exact: true }).first();
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        await page.mouse.move(2, 2);
        await page.waitForTimeout(1500);
        return name;
      }
    }
    await page.keyboard.press('Escape');
  }
  throw new Error(`no mode control named ${names.join(' or ')}`);
}

/** Hide the strip list a scenario opened from, and show the tab's own list if it has one. */
async function tabOnly(page, stripName, tabListTitle) {
  const item = page
    .getByRole('toolbar', { name: 'Workbench lists' })
    .getByRole('button', { name: stripName, exact: true })
    .filter({ visible: true })
    .first();
  if ((await item.getAttribute('aria-pressed').catch(() => null)) === 'true') await item.click();
  if (tabListTitle) {
    const show = control(page, 'button', `Show ${tabListTitle}`, { exact: true });
    if (await show.isVisible().catch(() => false)) await show.click();
  }
  await page.mouse.move(2, 2);
  await page.waitForTimeout(800);
}

/** On a phone the pane holds the tab's list or its body; show the body. */
async function phoneTabBody(page, listTitle) {
  if ((page.viewportSize()?.width ?? 1280) > 480) return;
  const hide = control(page, 'button', `Hide ${listTitle}`, { exact: true });
  if (await hide.isVisible().catch(() => false)) {
    await hide.dispatchEvent('click');
    await page.waitForTimeout(600);
  }
}

/** Open the study's science log from the workbench strip. */
async function openScienceLog(page) {
  await stripList(page, 'Science log');
  // A list left open on the strip covers the study's own; show the study.
  const show = control(page, 'button', 'Show Study', { exact: true });
  // On a phone the canvas sheet takes the pointer; click by event.
  if (await show.isVisible().catch(() => false)) await show.dispatchEvent('click');
  await showsText(page, 'Was 2022 below baseline?');
  await page.waitForTimeout(800);
}

/** Open the Opal vault: Sources list, Manage sources, the connected source, Open knowledge. */
async function openVault(page) {
  await stripList(page, 'Sources');
  await page
    .getByRole('region', { name: 'Sources list' })
    .getByRole('button', { name: 'Manage sources' })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Your sources', visible: true }).last();
  // The narrow canvas sheet sits under the dialog and takes the pointer; click by event.
  await dialog.getByRole('button').filter({ hasText: 'Opal vault' }).first().dispatchEvent('click');
  await page.getByRole('button', { name: 'Open knowledge' }).dispatchEvent('click');
  // The vault opens as a tab under the Sources list; close the list to show it.
  const sources = page
    .getByRole('toolbar', { name: 'Workbench lists' })
    .getByRole('button', { name: 'Sources', exact: true })
    .filter({ visible: true })
    .first();
  if ((await sources.getAttribute('aria-pressed').catch(() => null)) === 'true')
    await sources.click();
  await page
    .locator('[data-slot="knowledge-vault"], [aria-label="Knowledge source"]')
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 15000 });
  await Promise.any([
    showsText(page, 'Opal sites'),
    page
      .locator('[aria-label="Note graph"]')
      .filter({ visible: true })
      .first()
      .waitFor({ timeout: 15000 }),
  ]);
}

async function openVaultNote(page, title) {
  await openVault(page);
  // The vault's own file list sits beside the tab; its row picks the note and reads it.
  const show = control(page, 'button', 'Show Vault', { exact: true });
  if (await show.isVisible().catch(() => false)) await show.click();
  const name = new RegExp(`^${title}, \\d+ links?$`, 'u');
  const row = page
    .getByRole('list', { name: 'Vault files' })
    .getByRole('button', { name })
    .filter({ visible: true })
    .first();
  const node = control(page, 'button', new RegExp(`^Open ${title}, \\d+ links?`, 'u'));
  const listed = await row
    .waitFor({ timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (listed) await row.click();
  else await node.click();
  const body = page.getByText('The Opal network is 412').filter({ visible: true }).first();
  const read = await body
    .waitFor({ timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (!read) await pickMode(page, ['Note']);
  await showsText(page, 'The Opal network is 412');
  await page.waitForTimeout(800);
}

/** Holds the command key past the half-second delay; the shot keeps it held. */
async function holdCommandKey(page) {
  const mac = await page.evaluate(() => /Mac/u.test(navigator.platform));
  // Blur rather than click: a click outside would dismiss the narrow canvas sheet.
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  await page.keyboard.down(mac ? 'Meta' : 'Control');
  await page.waitForTimeout(900);
}

async function typeInComposer(page, text) {
  const composer = page.locator(COMPOSER).filter({ visible: true }).first();
  await composer.click();
  await page.keyboard.type(text);
}

// Providers and Usage with the spec's servers and accounts (`settingsModels`
// seeds the fixture: a scenario name, or `{scenario, failures}`), plus the
// states behind a hover or a click and the failure states.
function seededSettingsShots() {
  const seeded = (state, url, setup, extra = {}) => ({
    surface: 'settings',
    state,
    url,
    setup,
    settingsModels: 'spec',
    ready: 'main',
    settleMs: 1500,
    ...extra,
  });
  const row = (page, slot, name) =>
    page
      .locator(`[data-slot="${slot}"]`)
      .filter({ hasText: name })
      .filter({ visible: true })
      .first();
  return [
    seeded('providers-seeded', '/settings/providers'),
    seeded(
      'providers-row-actions',
      '/settings/providers',
      async (page) => {
        await row(page, 'model-server-row', 'LM Studio').hover();
        await page.waitForTimeout(300);
      },
      { keepPointer: true },
    ),
    // A saved server, unlike a built-in runtime, shows Remove as a direct action.
    seeded(
      'providers-row-actions-custom',
      '/settings/providers',
      async (page) => {
        await row(page, 'model-server-row', 'Workstation').hover();
        await page.waitForTimeout(300);
      },
      { keepPointer: true },
    ),
    seeded('providers-remove-confirm', '/settings/providers', async (page) => {
      const server = row(page, 'model-server-row', 'Workstation');
      await server.hover();
      const remove = server.getByRole('button', { name: 'Remove', exact: true });
      // On a phone the row's actions fold into its ⋯ menu.
      if (await remove.isVisible()) await remove.click();
      else {
        await press(page, 'button', 'More for Workstation');
        await page.getByRole('menuitem', { name: /^Remove/u }).click();
      }
      await page.waitForTimeout(300);
    }),
    seeded('providers-details', '/settings/providers', async (page) => {
      await row(page, 'model-server-row', 'Ollama').hover();
      await press(page, 'button', 'More for Ollama');
      await page.getByRole('menuitem', { name: /^Details/u }).click();
      await page.waitForTimeout(600);
    }),
    seeded('providers-add-server', '/settings/providers', async (page) => {
      await press(page, 'button', /^Add server/u);
      await overlay(page);
    }),
    seeded('usage-seeded', '/settings/usage'),
    seeded('usage-remaining', '/settings/usage', async (page) => {
      await press(page, 'radio', 'Remaining');
      await page.waitForTimeout(300);
    }),
    // Failure states: the fixture answers the named endpoints with an error.
    seeded('models-error', '/settings/models', null, {
      settingsModels: { scenario: 'spec', failures: ['providers-lm', 'fleet'] },
    }),
    seeded('providers-error', '/settings/providers', null, {
      settingsModels: { scenario: 'spec', failures: ['servers'] },
    }),
    seeded('usage-error', '/settings/usage', null, {
      settingsModels: { scenario: 'spec', failures: ['usage'] },
    }),
    seeded('usage-details', '/settings/usage', async (page) => {
      const account = row(page, 'usage-account-row', 'ChatGPT Pro');
      await account.hover();
      await account.getByRole('button', { name: 'Details' }).click();
      await page.waitForTimeout(600);
    }),
  ];
}

// The update flow and What's new, driven through the real recovery path: a
// pending-update marker and a stand-in for the desktop host's commands.
const APP_VERSION = JSON.parse(readFileSync(resolve(webRoot, '../package.json'), 'utf8')).version;

function desktopStub({ version, marker, desktop, seen, boot, update }) {
  try {
    if (marker)
      localStorage.setItem(
        'clio.pending-update',
        JSON.stringify({ ...marker, startedAt: Date.now() }),
      );
    if (seen) localStorage.setItem('clio.whatsNew.desktopVersion', seen);
  } catch {
    // Opaque-origin frames have no storage.
  }
  if (desktop) window.__CLIO_DESKTOP__ = { version };
  let id = 0;
  const callbacks = new Map();
  // With `update`, the signed feed offers it and its download stops part way:
  // the host owns no runtime, so the page shows only the app's own download.
  const answers = update
    ? {
        'plugin:updater|check': () => ({
          rid: 1,
          currentVersion: version,
          version: update.version,
          date: '2026-11-04T00:00:00Z',
          body: '',
          rawJson: {},
        }),
        has_managed_runtime: () => false,
        managed_runtime_update_mode: () => 'external',
        // The desktop host's own service is the fixture this run connects to.
        get_backend: () => ({
          url: JSON.parse(localStorage.getItem('clio.recent-connections') ?? '[]')[0],
          bearer_token: '',
          status: { kind: 'ready' },
        }),
        'plugin:updater|download': ({ onEvent }) => {
          // Channel ordering is `index` in newer @tauri-apps/api, `id` in older.
          const send = (index, message) =>
            callbacks.get(onEvent.id)?.({ id: index, index, message });
          send(0, { event: 'Started', data: { contentLength: update.total } });
          send(1, { event: 'Progress', data: { chunkLength: update.downloaded } });
          return new Promise(() => undefined);
        },
      }
    : {};
  window.__TAURI_INTERNALS__ = {
    transformCallback: (callback) => {
      callbacks.set(++id, callback);
      return id;
    },
    unregisterCallback: (callbackId) => callbacks.delete(callbackId),
    // Only the app version (and an offered update) answers; everything else
    // stays pending, as on a host that is still coming up.
    invoke: (command, args) => {
      if (command === 'plugin:app|version' && version) return Promise.resolve(version);
      // Local startup: the service was found missing, and the runtime is being prepared.
      if (boot && command === 'get_backend') {
        const detail =
          (boot.calls = (boot.calls ?? 0) + 1) > 1 ? 'installing_runtime' : 'checking_existing';
        return Promise.resolve({ url: '', bearer_token: '', status: { kind: 'starting', detail } });
      }
      if (boot && command === 'read_logs')
        return Promise.resolve(
          '=== backend boot log ===\nUsing CPython 3.12.8\nResolved 214 packages in 1.8s\n',
        );
      if (answers[command]) return Promise.resolve(answers[command](args ?? {}));
      return new Promise(() => undefined);
    },
  };
}

function updateShots() {
  const marker = { action: 'both', version: '0.11.4' };
  const MB = 1024 * 1024;
  return [
    {
      surface: 'updates',
      state: 'update-progress',
      url: SESSION,
      ready: '[data-slot="update-page"]',
      initScript: [desktopStub, { marker }],
    },
    {
      surface: 'updates',
      state: 'update-downloading',
      url: SESSION,
      // The background check offers 0.11.4; its toast starts the update.
      ready: '[data-sonner-toast] button',
      setup: async (page) => {
        await page
          .locator('[data-sonner-toast] button')
          .filter({ hasText: /^Update / })
          .click();
        await page.locator('[data-slot="step-list"]').getByText('41 of 66 MB').waitFor();
      },
      initScript: [
        desktopStub,
        {
          desktop: true,
          version: '0.11.3',
          seen: '0.11.3',
          update: { version: '0.11.4', total: 66 * MB, downloaded: 41 * MB },
        },
      ],
    },
    {
      surface: 'updates',
      state: 'update-failed',
      url: SESSION,
      ready: '[data-slot="update-page"] [role="alert"]',
      initScript: [desktopStub, { marker, version: '0.11.3' }],
    },
    {
      surface: 'updates',
      state: 'whats-new',
      url: '/',
      connected: false,
      ready: '[role="dialog"]',
      allowLoading: true,
      initScript: [desktopStub, { desktop: true, version: APP_VERSION, seen: '0.11.3-beta.11' }],
    },
  ];
}

// --- Shot catalogue ------------------------------------------------------------
//
// Each shot: {surface, state, url, setup?, ready?, scenario?, settingsModels?,
// fixtureDemo?, connected?, route?, keepPointer?, platform?, decision?,
// initScript?: [fn, arg] run before the app}. `fixtureDemo` names a fixture
// `POST /__test/<name>` switch applied after the scenario reset (for example
// `science-views`). `platform: 'mac'` makes the page report a Mac, for its ? keys.
// `decision` turns on one fixture decision card for the shot only.
// `ready` is a css selector that must be visible before setup (default: a
// transcript message on conversation URLs, otherwise <main>).

function catalogue({ settings, infrastructure }) {
  const s = (surface, state, url, setup, extra = {}) => ({ surface, state, url, setup, ...extra });
  const menu = (state, role, name, options) =>
    s('session', state, SESSION, async (page) => {
      await press(page, role, name, options);
      await overlay(page);
    });
  return [
    s('connect', 'first-run', '/', null, { connected: false, ready: 'main' }),
    s('connect', 'local-startup', '/', null, {
      connected: false,
      ready: '[aria-label="Startup progress"] [aria-current="step"]',
      allowLoading: true,
      settleMs: 2500,
      initScript: [
        desktopStub,
        { desktop: true, version: APP_VERSION, seen: APP_VERSION, boot: {} },
      ],
    }),
    s('connect', 'unreachable-service', '/', null, {
      connected: 'http://127.0.0.1:9',
      ready: 'main',
      settleMs: 4000,
    }),
    s('session', 'conversation', SESSION),
    s('session', 'loading', SESSION, null, {
      route: 'hang-messages',
      ready: 'main',
      settleMs: 1500,
      allowLoading: true,
    }),
    s('session', 'load-error', SESSION, null, {
      route: 'fail-messages',
      ready: 'main',
      settleMs: 3000,
    }),
    s('session', 'sidebar-toggled', SESSION, async (page) => {
      await page
        .locator('button[data-sidebar="trigger"]')
        .filter({ visible: true })
        .first()
        .click();
      await page.waitForTimeout(600);
    }),
    s('session', 'activity-expanded', SESSION, async (page) => {
      await page
        .getByRole('button', { name: /^Expand / })
        .filter({ visible: true })
        .last()
        .click();
      await page.waitForTimeout(600);
    }),
    s('session', 'attention-technical-details', SESSION, async (page) => {
      await press(page, 'button', 'Technical details');
      await page.waitForTimeout(400);
    }),
    // Data-dependent card parts: the script ask (Rest of this script) paged
    // 1/2, the Runs on / Asked by / Folders facts, the plan, a dismissible question.
    ...['script', 'facts', 'plan', 'question'].map((card) =>
      s('session', `decision-${card}`, SESSION, null, {
        decision: card,
        ready: '[data-slot="ask-card"]',
      }),
    ),
    s(
      'session',
      'decision-script-details',
      SESSION,
      async (page) => {
        // Transcript rows have their own Technical details; open the card's.
        await page
          .locator('[data-slot="ask-card"]')
          .getByRole('button', { name: 'Technical details' })
          .click();
        await page.waitForTimeout(400);
      },
      { decision: 'script', ready: '[data-slot="ask-card"]' },
    ),
    s(
      'session',
      'transcript-outline',
      SESSION,
      async (page) => {
        await press(page, 'button', 'Open transcript outline');
        await overlay(page);
      },
      // Wider layouts show the transcript minimap instead of the outline button.
      { maxWidth: 1024 },
    ),
    // Hold Ctrl (⌘ with `platform: 'mac'`): every keyed control shows its key.
    ...['windows', 'mac'].flatMap((platform) => [
      s('session', `held-keys-${platform}`, SESSION, holdCommandKey, { platform }),
      s(
        'session',
        `held-keys-pocket-${platform}`,
        SESSION,
        async (page) => {
          await openFile(page, 'results/stations.csv');
          await holdCommandKey(page);
        },
        { platform },
      ),
      // Two tabs, so the active one shows its previous/next pair.
      s(
        'session',
        `held-keys-tabs-${platform}`,
        SESSION,
        async (page) => {
          await openFile(page, 'results/vertical-displacement.png');
          // Opening a file closes the list; show it again for the second file.
          const files = page
            .getByRole('toolbar', { name: 'Workbench lists' })
            .getByRole('button', { name: 'Files', exact: true })
            .filter({ visible: true })
            .first();
          if (!(await page.getByRole('region', { name: 'Files list' }).isVisible()))
            await files.click();
          await page.waitForTimeout(500);
          await openFile(page, 'results/stations.csv');
          await holdCommandKey(page);
        },
        { platform },
      ),
    ]),
    menu('menu-search-work', 'button', 'Search work'),
    menu('menu-workspace-actions', 'button', /^Workspace actions for /u),
    menu('menu-session-actions', 'button', /^Session actions for /u),
    menu('menu-attention-inbox', 'button', /^Notifications|needs your response/u),
    s(
      'session',
      'menu-service-status',
      SESSION,
      async (page) => {
        await press(page, 'button', /^[^:]+: .+, this computer$/u);
        await overlay(page);
        await settleSavedAgents(page);
      },
      { savedAgents: true },
    ),
    s(
      'session',
      'menu-clio-add-agent',
      SESSION,
      async (page) => {
        await press(page, 'button', /^[^:]+: .+, this computer$/u);
        await overlay(page);
        await settleSavedAgents(page);
        // By key, so moving the pointer away before the capture keeps it open.
        await page.getByRole('menuitem', { name: /^Add an agent/u }).focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);
      },
      { savedAgents: true },
    ),
    s('session', 'infrastructure-status-expanded', SESSION, async (page) => {
      await press(page, 'button', /^Infrastructure: /u);
      await page.waitForTimeout(500);
    }),
    menu('menu-conversation-actions', 'button', /^Actions for /u),
    s('session', 'menu-conversation-export', SESSION, async (page) => {
      await press(page, 'button', /^Actions for /u);
      await overlay(page);
      await page.getByRole('menuitem', { name: 'Export', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(400);
    }),
    menu('composer-model-picker', 'button', 'Change model'),
    menu('composer-reasoning-effort', 'button', /^Reasoning effort/u),
    menu('composer-execution-mode', 'button', /^Execution mode/u),
    menu('composer-confirmation-policy', 'button', /^Confirmation policy/u),
    menu('composer-attach-files', 'button', 'Attach files'),
    menu('composer-add-reference', 'button', 'Add a reference'),
    s('session', 'composer-draft', SESSION, async (page) => {
      await typeInComposer(
        page,
        'Compare station coverage against the 2024 baseline and flag gaps.',
      );
      await page.waitForTimeout(300);
    }),
    s('session', 'composer-mention', SESSION, async (page) => {
      await typeInComposer(page, 'Compare @');
      await overlay(page);
    }),
    s('session', 'composer-slash-commands', SESSION, async (page) => {
      await typeInComposer(page, '/');
      await overlay(page);
    }),
    s('session', 'dialog-new-session', SESSION, async (page) => {
      // New conversation is a draft in place (full-picture/08), not a dialog.
      await press(page, 'button', 'New conversation', { exact: true });
      await page.waitForTimeout(300);
    }),
    s('session', 'held-keys', SESSION, async (page) => {
      // Holding the command key alone shows each control's shortcut badge.
      await page.keyboard.down('Control');
      await page.waitForTimeout(900);
    }),
    s('session', 'dialog-new-workspace', SESSION, async (page) => {
      await press(page, 'button', 'New workspace', { exact: true });
      await page.waitForTimeout(300);
    }),
    s(
      'session',
      'dialog-allow-folder',
      SESSION,
      async (page) => {
        // From the keyboard, so the focus ring shows where it starts (Cancel), as the spec draws.
        await control(page, 'button', 'Allow opal').focus();
        await page.keyboard.press('Enter');
        await overlay(page);
      },
      { route: 'sandbox-blocked' },
    ),
    s('session', 'dialog-new-session-advanced', SESSION, async (page) => {
      await press(page, 'button', 'New workspace', { exact: true });
      await overlay(page);
      await press(page, 'radio', 'Session', { exact: true });
      await press(page, 'button', 'Advanced session behavior');
      await page.waitForTimeout(300);
    }),
    s('session', 'dialog-rename-session', SESSION, async (page) => {
      await press(page, 'button', /^Actions for /u);
      await press(page, 'menuitem', 'Rename', { exact: true });
      await overlay(page);
    }),
    s('session', 'dialog-delete-session', SESSION, async (page) => {
      await press(page, 'button', /^Actions for /u);
      await press(page, 'menuitem', 'Delete…', { exact: true });
      await overlay(page);
    }),
    s('keyboard', 'shortcut-sheet', SESSION, async (page) => {
      await page.keyboard.press('Control+/');
      await overlay(page);
    }),
    s('keyboard', 'shortcut-sheet-mac', SESSION, async (page) => {
      await page.keyboard.press('Control+/');
      await overlay(page);
      await press(page, 'radio', 'Mac', { exact: true });
      await page.getByRole('textbox', { name: 'Find a shortcut' }).focus();
    }),
    s('keyboard', 'shortcut-sheet-find', SESSION, async (page) => {
      await page.keyboard.press('Control+/');
      await overlay(page);
      await page.keyboard.type('conversation');
      await page.waitForTimeout(300);
    }),
    s('keyboard', 'command-palette-settings', SESSION, async (page) => {
      await page.keyboard.press('Control+k');
      await overlay(page);
      await page.keyboard.type('settings');
      await page.waitForTimeout(500);
    }),
    s(
      'session',
      'dialog-archived',
      SESSION,
      async (page) => {
        await press(page, 'button', 'Create or import');
        await overlay(page);
        await page.getByRole('menuitem', { name: 'Archived conversations' }).click();
        await page.getByRole('dialog', { name: 'Archived conversations' }).waitFor();
        await page.waitForTimeout(300);
      },
      { route: 'archived-sessions' },
    ),
    s(
      'session',
      'dialog-archived-delete',
      SESSION,
      async (page) => {
        await press(page, 'button', 'Create or import');
        await overlay(page);
        await page.getByRole('menuitem', { name: 'Archived conversations' }).click();
        await page.getByRole('button', { name: 'Delete Soil moisture regrid' }).click();
        await page.getByRole('dialog', { name: 'Delete Soil moisture regrid?' }).waitFor();
        await page.waitForTimeout(300);
      },
      { route: 'archived-sessions' },
    ),
    s('session', 'dialog-share', SESSION, async (page) => {
      await press(page, 'button', /^Actions for /u);
      await overlay(page);
      await page.getByRole('menuitem', { name: 'Share read-only link' }).click();
      await page.getByRole('dialog', { name: /^Share / }).waitFor();
      await page.waitForTimeout(300);
    }),
    s(
      'session',
      'dialog-share-link',
      SESSION,
      async (page) => {
        await press(page, 'button', /^Actions for /u);
        await overlay(page);
        await page.getByRole('menuitem', { name: 'Share read-only link' }).click();
        await page.getByRole('button', { name: 'Create share link' }).click();
        await page.getByRole('textbox', { name: 'Share link' }).waitFor();
        await page.waitForTimeout(300);
      },
      { route: 'share-link' },
    ),
    s('canvas', 'activity', SESSION, openCanvas),
    s('canvas', 'tab-context-menu', SESSION, async (page) => {
      await openFile(page, 'results/stations.csv');
      await page
        .locator('[aria-label="Workspace canvas"] [role="tab"][aria-selected="true"]')
        .filter({ visible: true })
        .first()
        .click({ button: 'right' });
      await overlay(page);
    }),
    // workbench-right-pocket "List hidden, tab menu open": the list's strip icon
    // clicked again, a pinned tab first, the menu on the open middle tab.
    s('canvas', 'tab-menu-list-hidden', SESSION, async (page) => {
      await openFile(page, 'results/stations.csv');
      await openFile(page, 'results/vertical-displacement.png');
      await stripList(page, 'Agent');
      const tabs = page
        .locator('[aria-label="Workspace canvas"] [role="tab"]')
        .filter({ visible: true });
      await tabs.filter({ hasText: 'stations.csv' }).first().click({ button: 'right' });
      await overlay(page);
      await page.getByRole('menuitem', { name: /^Pin/u }).click();
      await page.waitForTimeout(300);
      const image = tabs.filter({ hasText: 'vertical-displacement.png' }).first();
      await image.click();
      await page.waitForTimeout(300);
      const lit = page
        .getByRole('toolbar', { name: 'Workbench lists' })
        .locator('button[aria-pressed="true"]')
        .filter({ visible: true })
        .first();
      if (await lit.isVisible().catch(() => false)) await lit.click();
      await page.waitForTimeout(400);
      await image.click({ button: 'right' });
      await overlay(page);
    }),
    s('canvas', 'files-list', SESSION, (page) => stripList(page, 'Files')),
    s('canvas', 'files-list-expanded', SESSION, (page) => expandedFiles(page, 4)),
    s('canvas', 'file-csv', SESSION, (page) => openFile(page, 'results/stations.csv')),
    // workbench-lineage "The tab row, as it narrows": several tabs, the last opened in front.
    s(
      'canvas',
      'tabs-many',
      SESSION,
      async (page) => {
        for (const path of [
          'ndp/soil_sites.csv',
          'scripts/soil_qc.py',
          'ndp/soil_moisture.h5',
          'plan.md',
          'diagrams/pipeline.mmd',
        ])
          await openFile(page, path);
      },
      { scenario: { specFiles: true }, settleMs: 1500 },
    ),
    // workbench-lineage "Step 6, … open": narrowest (the Activity list beside the
    // tab), the modes are a checked list in …. Where the list is a sheet over
    // the tab, it hides first.
    s('canvas', 'file-csv-more', SESSION, async (page) => {
      await openFile(page, 'results/stations.csv');
      await stripList(page, 'Activity');
      const more = page
        .getByRole('toolbar', { name: 'File' })
        .filter({ visible: true })
        .getByRole('button', { name: 'File actions' })
        .first();
      if (
        !(await more.click({ timeout: 2000 }).then(
          () => true,
          () => false,
        ))
      ) {
        await page
          .getByRole('toolbar', { name: 'Workbench lists' })
          .locator('button[aria-pressed="true"]')
          .filter({ visible: true })
          .first()
          .click();
        await page.waitForTimeout(400);
        await more.click();
      }
      await overlay(page);
    }),
    s('canvas', 'file-image', SESSION, (page) =>
      openFile(page, 'results/vertical-displacement.png'),
    ),
    // A frame bar folded to its active mode and a chevron (390): the modes as a
    // checked list with the key that works anywhere (workbench-keyboard).
    s('canvas', 'file-csv-modes', SESSION, async (page) => {
      await openFile(page, 'results/stations.csv');
      const folded = page.locator('[data-modes-folded]').filter({ visible: true }).first();
      const fallback = page
        .getByRole('toolbar', { name: 'File' })
        .filter({ visible: true })
        .getByRole('button', { name: 'File actions' })
        .first();
      if (await folded.isVisible().catch(() => false)) await folded.click();
      else await fallback.click();
      await overlay(page);
    }),
    s('canvas', 'sources-list', SESSION, (page) => stripList(page, 'Sources')),
    s('canvas', 'artifacts-list', SESSION, (page) => stripList(page, 'Artifacts')),
    s('canvas', 'activity-list', SESSION, (page) => stripList(page, 'Activity')),
    // The former Work tab is now the Activity list's finished work.
    s('canvas', 'work', SESSION, async (page) => {
      await stripList(page, 'Activity');
      const show = page
        .getByRole('region', { name: 'Activity list' })
        .getByRole('button', { name: 'Show finished work' })
        .filter({ visible: true })
        .first();
      if (await show.isVisible().catch(() => false)) await show.click();
      await page.waitForTimeout(800);
    }),
    s('canvas', 'agent', SESSION, (page) => stripList(page, 'Agent')),
    s('canvas', 'agent-customize', SESSION, async (page) => {
      await press(page, 'button', 'Customize the agent');
      await page.waitForTimeout(800);
    }),
    s('canvas', 'maximized', SESSION, async (page) => {
      await openCanvas(page);
      // Under 900px the list is a sheet over the tab and covers the row's Maximize;
      // opening a file closes the sheet, as a tap on a narrow window does.
      if ((page.viewportSize()?.width ?? 1280) < 900) await openFile(page, 'results/stations.csv');
      await press(page, 'button', 'Maximize canvas');
      await page.waitForTimeout(600);
    }),
    s('new-conversation', 'welcome', '/workspaces/ws_flat_ndp/new', null, { ready: 'h3' }),
    ...settings.map(({ href, name }) =>
      s('settings', slug(name), href, null, {
        ready: 'main',
        settleMs: 1500,
      }),
    ),
    s('settings', 'models-default-picker', '/settings/models', async (page) => {
      await press(page, 'button', 'Default model', { exact: true });
      await overlay(page);
    }),
    ...seededSettingsShots(),
    ...updateShots(),
    s('settings', 'dialog-allow-folder', '/settings/folders', async (page) => {
      await press(page, 'button', 'Add folder', { exact: true });
      await overlay(page);
      await page.getByRole('dialog').getByRole('textbox').first().fill('/scratch/jc/opal');
      await page.waitForTimeout(300);
    }),
    s('settings', 'search-everywhere', '/settings/general', async (page) => {
      await press(page, 'button', 'Search everywhere');
      await overlay(page);
    }),
    s('runs', 'executions', '/runs', null, { ready: '[data-run-state]' }),
    s(
      'runs',
      'selected',
      '/runs',
      async (page) => {
        await page.locator('[data-run-state] button').first().click();
        await page.waitForTimeout(600);
      },
      { ready: '[data-run-state]' },
    ),
    s('runs', 'flows', '/runs', async (page) => {
      await press(page, 'radio', /^Flows/u);
      await page.waitForTimeout(500);
    }),
    s(
      'runs',
      'state-filter',
      '/runs',
      async (page) => {
        await press(page, 'radio', /^Waiting for you/u);
        await page.waitForTimeout(400);
      },
      { ready: '[data-run-state]' },
    ),
    // The selected run opens as a tab beside the list (a sheet below 1024px).
    s(
      'runs',
      'details',
      '/runs',
      async (page) => {
        await page.locator('[data-run-state] button[type="button"]').first().click();
        await page
          .locator('aside[aria-label^="Run: "]')
          .filter({ visible: true })
          .first()
          .waitFor();
        await page.waitForTimeout(500);
      },
      { ready: '[data-run-state]' },
    ),
    ...infrastructure.map(({ href, name }) =>
      s('infrastructure', slug(name), href, null, { ready: 'h1', settleMs: 1200 }),
    ),
    s(
      'infrastructure',
      'agent-hosts-attention',
      '/infrastructure/agent',
      async (page) => {
        await page
          .getByRole('button', { name: /Conversation memory/u })
          .first()
          .click();
        await page.waitForTimeout(300);
      },
      { ready: 'h1', settleMs: 1200, route: 'degraded-health' },
    ),
    s(
      'infrastructure',
      'activity-failure',
      '/infrastructure/activity',
      async (page) => {
        await page.getByRole('button', { name: 'Start SearXNG details' }).click();
        await page.waitForTimeout(300);
      },
      { ready: 'h1', settleMs: 1200 },
    ),
    // A computer row with its hover actions showing (narrow, laid over the row's end).
    // Touch layouts have no hover, so the row takes keyboard focus instead.
    s(
      'infrastructure',
      'agent-hosts-hover',
      '/infrastructure/agent',
      async (page) => {
        const host = page.locator('[data-slot="list-row"]', { hasText: 'utah-cluster' }).first();
        await host.hover();
        // The actions are hidden until then, so focus goes to the name's button.
        await host.locator('button[aria-expanded]').first().focus();
        await page.waitForTimeout(300);
      },
      { ready: 'h1', settleMs: 1200, keepPointer: true },
    ),
    s('not-found', 'unknown-route', '/this-route-does-not-exist', null, { ready: 'body' }),
    s('scale', 'long-conversation-tail', HUGE, null, {
      scenario: { messages: 600, toolsPerMessage: 2 },
      ready: '[data-message-id="msg_perf_000599"]',
    }),
    s('scale', 'many-sessions-sidebar', SESSION, null, {
      scenario: { sessions: 300, workspaces: 20 },
    }),
    s(
      'scale',
      'many-sessions-search',
      SESSION,
      async (page) => {
        await press(page, 'button', 'Search work');
        await overlay(page);
      },
      { scenario: { sessions: 300, workspaces: 20 } },
    ),
    s('scale', 'large-file-tree', SESSION, (page) => stripList(page, 'Files'), {
      scenario: { files: 2000, largeFileBytes: 2 * 1024 * 1024 },
    }),
    s('scale', 'large-file-tree-expanded', SESSION, (page) => expandedFiles(page, 6), {
      scenario: { files: 2000, largeFileBytes: 2 * 1024 * 1024 },
    }),
    s('scale', 'large-csv', SESSION, (page) => openFile(page, 'perf/large-table.csv'), {
      scenario: { files: 2000, largeFileBytes: 2 * 1024 * 1024 },
    }),
    // One tab per viewer format, with the design specs' example files.
    ...Object.entries({
      table: 'ndp/soil_sites.csv',
      markdown: 'plan.md',
      code: 'scripts/soil_qc.py',
      document: 'reports/opal_report.pdf',
      image: 'figures/baseline_plot.png',
      mermaid: 'diagrams/pipeline.mmd',
      array: 'ndp/soil_moisture.h5',
      'no-preview': 'ndp/forecast.grib2',
      'state-too-large': 'figures/swath_mosaic.png',
    }).map(([format, path]) =>
      s('viewer', format, SESSION, (page) => openFile(page, path), {
        scenario: { specFiles: true },
        settleMs: 1500,
      }),
    ),
    s(
      'viewer',
      'state-loading',
      SESSION,
      async (page) => {
        // Hang only this file's read, after the app has booted.
        await page.route('**/files/read*', () => undefined);
        await openFile(page, 'ndp/soil_sites.csv', { settled: false });
      },
      { scenario: { specFiles: true }, allowLoading: true },
    ),
    s(
      'viewer',
      'state-error',
      SESSION,
      async (page) => {
        await page.route('**/files/read*', (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'unavailable', message: 'The workspace volume is not mounted.' },
            }),
          }),
        );
        await openFile(page, 'ndp/soil_sites.csv');
      },
      { scenario: { specFiles: true } },
    ),
    s('viewer', 'activity', SESSION, (page) => stripList(page, 'Activity'), {
      scenario: { specFiles: true },
    }),
    s('viewer', 'browser-pages', SESSION, (page) => stripList(page, 'Browser pages'), {
      scenario: { specFiles: true },
    }),
    // Science views (design spec "Science views are viewers in the one tab"):
    // the fixture's Opal study, vault, dashboard and paper.
    ...[
      [
        'science-log',
        async (page) => {
          await openScienceLog(page);
          await phoneTabBody(page, 'Study');
          // The spec opens one observation in place.
          const row = page.locator('[data-entry-row]').filter({ hasText: '2022 is' }).first();
          if (await row.isVisible().catch(() => false)) await row.dispatchEvent('click');
          await page.waitForTimeout(600);
        },
      ],
      [
        'study-graph',
        async (page) => {
          await openScienceLog(page);
          await phoneTabBody(page, 'Study');
          await pickMode(page, ['Lineage', 'Study graph', 'Graph']);
        },
      ],
      ['knowledge', (page) => openVaultNote(page, 'Opal sites')],
      [
        'knowledge-graph',
        async (page) => {
          await openVault(page);
          await pickMode(page, ['Lineage', 'Note graph', 'Graph']);
        },
      ],
      [
        'dashboard',
        async (page) => {
          await stripList(page, 'Artifacts');
          await control(page, 'button', /^Open (Opal sites|opal-sites)/u).click();
          await showsText(page, '2022 vs baseline');
          await tabOnly(page, 'Artifacts');
        },
      ],
      [
        'latex',
        async (page) => {
          await openFile(page, 'paper/opal_paper.tex', { settled: false });
          await showsAny(page, [
            'Citation smap008 undefined',
            'Overfull hbox',
            'SMAP L3 soil moisture',
          ]);
          await tabOnly(page, 'Files', 'Outline');
          await phoneTabBody(page, 'Outline');
        },
      ],
    ].map(([state, setup]) =>
      s('viewer', state, SESSION, setup, { fixtureDemo: 'science-views', settleMs: 1500 }),
    ),
  ];
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/&/gu, 'and')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

// --- Theme gap scan ---------------------------------------------------------------

/**
 * Large visible surfaces whose painted background belongs to the other theme:
 * near-black panels in light mode, near-white panels in dark mode. Media,
 * canvases, code previews of user content and tiny chips are ignored.
 */
function themeGaps(theme) {
  const parse = (color) => {
    const match = color.match(/rgba?\(([^)]+)\)/u);
    if (!match) return null;
    const [r, g, b, a = 1] = match[1]
      .split(/[ ,/]+/u)
      .filter(Boolean)
      .map(Number);
    return a < 0.6 ? null : { r, g, b };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const describe = (element) => {
    const name =
      element.getAttribute('aria-label') ||
      element.getAttribute('data-slot') ||
      element.getAttribute('role') ||
      (typeof element.className === 'string'
        ? element.className.split(/\s+/u).slice(0, 3).join('.')
        : '');
    return `${element.tagName.toLowerCase()}${name ? ` [${name.slice(0, 60)}]` : ''}`;
  };
  const viewport = window.innerWidth * window.innerHeight;
  const gaps = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (element.closest('img,svg,canvas,video,picture,[data-theme-exempt]')) continue;
    const rect = element.getBoundingClientRect();
    const area =
      Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0)) *
      Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    if (area < Math.max(6000, viewport * 0.004)) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || Number(style.opacity) < 0.5) continue;
    const background = parse(style.backgroundColor);
    if (!background) continue;
    const value = luminance(background);
    const wrong = theme === 'light' ? value < 0.12 : value > 0.75;
    if (!wrong) continue;
    if (gaps.some((gap) => gap.element.contains(element))) continue;
    gaps.push({
      element,
      what: describe(element),
      background: style.backgroundColor,
      areaPercent: Math.round((area / viewport) * 1000) / 10,
    });
  }
  return gaps
    .sort((a, b) => b.areaPercent - a.areaPercent)
    .slice(0, 8)
    .map(({ what, background, areaPercent }) => ({ what, background, areaPercent }));
}

// --- Capture ---------------------------------------------------------------------

/** Saved agents settle after their availability probes and retries. */
async function settleSavedAgents(page) {
  await page
    .getByRole('menuitem', { name: /lab-shared.*Offline/u })
    .waitFor({ timeout: 4000 })
    .catch(() => undefined);
}

const SAVED_AGENTS = [
  { endpoint: 'https://ares.iit.edu', label: 'ares-genesis' },
  { endpoint: 'http://10.0.4.12:8100', label: 'lab-shared' },
];

async function newContext(
  browser,
  stack,
  { theme, width, connected = true, savedAgents = false, platform },
) {
  const mobile = width < 600;
  const context = await browser.newContext({
    viewport: { width, height: VIEWPORTS[width] ?? 900 },
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: theme.endsWith('light') ? 'light' : 'dark',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
  });
  context.setDefaultTimeout(6000);
  await context.clock.setFixedTime(FROZEN_TIME);
  await context.addInitScript(
    ({ theme, endpoint, others }) => {
      try {
        localStorage.setItem('clio.appearance.v1', JSON.stringify({ theme, motion: 'reduced' }));
        if (endpoint) {
          localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint, ...others]));
        } else localStorage.removeItem('clio.recent-connections');
      } catch {
        // Opaque-origin frames have no storage.
      }
    },
    {
      theme,
      endpoint: connected === true ? stack.endpoint : connected || null,
      others: savedAgents ? SAVED_AGENTS : [],
    },
  );
  if (savedAgents) {
    // Saved agents are client-side: one reachable (served by the fixture), one offline.
    await context.route('https://ares.iit.edu/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${stack.endpoint}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
    await context.route('http://10.0.4.12:8100/**', (route) => route.abort('connectionrefused'));
  }
  if (platform === 'mac') {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });
    });
  }
  return context;
}

async function discover(browser, stack) {
  const context = await newContext(browser, stack, { theme: 'dark', width: 1440 });
  const page = await context.newPage();
  const links = async (url, css) => {
    await page.goto(`${stack.baseURL}${url}`);
    await page.locator(css).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);
    return page.locator(css).evaluateAll((elements) =>
      elements.map((element) => ({
        href: element.getAttribute('href'),
        name: (element.getAttribute('aria-label') ?? element.textContent).trim(),
      })),
    );
  };
  const settings = await links('/settings/general', 'nav a[href^="/settings/"]');
  const infrastructure = (
    await links(
      '/infrastructure',
      'nav[aria-label="Infrastructure sections"] a[href^="/infrastructure"]',
    )
  ).filter((link, index, all) => all.findIndex((other) => other.href === link.href) === index);
  await context.close();
  return { settings, infrastructure };
}

// The fixture serves no task query, so the runs shots route a deterministic
// page of develop's states: needs-you, running, queued and earlier groups.
function sampleTasks() {
  const at = (minutes) => new Date(FROZEN_TIME.getTime() - minutes * 60_000).toISOString();
  const task = (index, kind, label, fields) => ({
    handle: `task_sample_${index}`,
    kind,
    owner: {
      human_id: 'human',
      session_id: 'sess_flat_ndp',
      assignment_id: `assignment_${index}`,
      parent_handle: null,
    },
    label,
    description: `${label}. Report the result and any files written to the workspace.`,
    description_missing: false,
    description_reference: null,
    tool: 'builtin',
    invocation_id: `invocation_${index}`,
    status: 'active',
    raw_status: 'working',
    activity: 'executing',
    progress: { message: '', completed: null, total: null, unit: '', output: null },
    supported_actions: ['observe', 'wait', 'cancel'],
    cancellation_requested_at: null,
    terminal_at: null,
    connection_freshness: 'fresh',
    settlement: 'unknown',
    recording: 'confirmed',
    created_at: at(fields.minutes + 5),
    updated_at: at(fields.minutes),
    result: null,
    details: null,
    backend: {
      owner: 'human',
      server: fields.server ?? 'Local',
      auth_scope: 'user',
      session: 's',
      task_id: `t${index}`,
      queue: 'default',
      execution_key: `k${index}`,
      transport: 'http',
      placement: 'local',
    },
    ...fields.patch,
  });
  const done = (status, minutes) => ({
    status,
    raw_status: status,
    activity: 'idle',
    terminal_at: at(minutes),
    supported_actions: ['observe'],
  });
  const tasks = [
    task(1, 'Subagent', 'Fit the NDP spectra across all 48 detector channels', {
      minutes: 2,
      patch: { activity: 'waiting_for_input', raw_status: 'input_required' },
    }),
    task(2, 'Shell', 'Rebuild the HDF5 index for run 2214', {
      minutes: 14,
      patch: {
        ...done('failed', 14),
        progress: {
          message: 'Process exited with code 137: out of memory while reading chunk 812',
          completed: null,
          total: null,
          unit: '',
          output: null,
        },
      },
    }),
    task(3, 'Session', 'Compare depth profiles with the SRIM reference', {
      minutes: 1,
      patch: {
        progress: {
          message: 'Comparing profiles',
          completed: 31,
          total: 48,
          unit: 'channels',
          output: null,
        },
      },
    }),
    task(4, 'Download', 'Download Qwen3 32B weights to /scratch/models', {
      minutes: 3,
      server: 'polaris-login-02',
      patch: {
        progress: { message: 'Downloading', completed: 18, total: 64, unit: 'GB', output: null },
      },
    }),
    task(5, 'Indexing', 'Index the SPOTTER campaign notebooks', {
      minutes: 0,
      patch: { activity: 'queued', raw_status: 'queued' },
    }),
    task(6, 'Subagent', 'Summarize beamline log anomalies for March', {
      minutes: 75,
      patch: done('completed', 75),
    }),
    task(7, 'MCP', 'Render the calibration report as PDF', {
      minutes: 190,
      patch: done('cancelled', 190),
    }),
    task(8, 'Shell', 'Sync results to the shared project storage', {
      minutes: 2900,
      server: 'aurora-uan-0010',
      patch: done('completed', 2900),
    }),
    task(9, 'Session', 'Draft the methods section from the analysis notes', {
      minutes: 9000,
      patch: done('interrupted', 9000),
    }),
  ];
  return { tasks, total: tasks.length, cursor: null, revision: 1 };
}

async function capture(browser, stack, shot, { theme, width }) {
  const context = await newContext(browser, stack, {
    theme,
    width,
    connected: shot.connected ?? true,
    platform: shot.platform,
    savedAgents: shot.savedAgents ?? false,
  });
  if (shot.initScript) await context.addInitScript(...shot.initScript);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]));
  if (shot.route === 'hang-messages') {
    await page.route('**/v1/sessions/*/messages*', () => undefined);
  } else if (shot.route === 'fail-messages') {
    await page.route('**/v1/sessions/*/messages*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'unavailable', message: 'The service is restarting.' },
        }),
      }),
    );
    // An idle session, so the failure is not mistaken for a turn being set up.
    await page.route(
      (url) => url.pathname === '/v1/sessions',
      async (route) => {
        const listing = await (await route.fetch()).json();
        for (const session of listing.sessions ?? []) session.state = 'idle';
        await route.fulfill({ json: listing });
      },
    );
  }
  if (shot.route === 'sandbox-blocked') {
    // The catalog search becomes a script the sandbox stopped from writing outside the workspace.
    await page.route('**/v1/sessions/*/messages*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const transcript = await (await route.fetch()).json();
      transcript.tools = (transcript.tools ?? []).map((tool) =>
        tool.id === 'tool_earthscope'
          ? {
              ...tool,
              name: 'shell_bash',
              title: 'Run',
              state: 'failed',
              input: { command: 'python qc_sites.py' },
              error: 'Permission denied: /scratch/jc/opal/sites.csv',
              output: {
                boundary: {
                  kind: 'write_denied',
                  confidence: 'confirmed',
                  paths: ['/scratch/jc/opal/sites.csv'],
                  request_roots: ['/scratch/jc/opal'],
                  message:
                    "CLIO's sandbox blocked this write. /scratch/jc/opal is not a permitted folder.",
                },
              },
            }
          : tool,
      );
      await route.fulfill({ json: transcript });
    });
  }
  if (shot.route === 'archived-sessions') {
    // The fixture archives nothing; three archived rows as the spec draws them.
    const archived = [
      ['sess_archived_regrid', 'Soil moisture regrid', '2026-08-30T10:00:00Z'],
      ['sess_archived_smap', 'SMAP granule audit', '2026-08-26T10:00:00Z'],
      ['sess_archived_probe', 'Probe calibration notes', '2026-08-11T10:00:00Z'],
    ];
    await page.route(
      (url) => url.pathname === '/v1/sessions',
      async (route) => {
        const listing = await (await route.fetch()).json();
        const template = listing.sessions?.find((row) => !row.parent_session_id);
        if (template) {
          for (const [id, title, at] of archived) {
            listing.sessions.push({
              ...template,
              id,
              title,
              state: 'completed',
              archived: true,
              pinned: false,
              updated_at: at,
            });
          }
          listing.total = listing.sessions.length;
        }
        await route.fulfill({ json: listing });
      },
    );
  }
  if (shot.route === 'share-link') {
    await page.route('**/v1/sessions/*/share', (route) =>
      route.fulfill({
        json: {
          token: 'shr_7f3k9q2m',
          session_id: 'sess_flat_ndp',
          url: '/s/7f3k9q2m',
          expires_at: '2026-09-08T15:00:00Z',
        },
      }),
    );
  }
  if (shot.route === 'degraded-health') {
    // One error and one warning, so the hosts tab shows every group.
    await page.route('**/v1/health', async (route) => {
      const health = await (await route.fetch()).json();
      health.overall_status = 'degraded';
      health.integrations = [
        { name: 'lm_provider', status: 'unavailable' },
        { name: 'arc', status: 'degraded' },
        ...health.integrations.filter(({ name }) => name !== 'arc'),
      ];
      await route.fulfill({ json: health });
    });
  }
  if (shot.surface === 'runs') {
    await page.route('**/v1/tasks/query*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sampleTasks()),
      }),
    );
  }
  const result = { surface: shot.surface, state: shot.state, theme, width };
  try {
    await page.goto(`${stack.baseURL}${shot.url}`);
    const ready = shot.ready ?? (shot.url.includes('/sessions/') ? MESSAGE : 'main');
    await page.locator(ready).filter({ visible: true }).first().waitFor({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(shot.settleMs ?? 900);
    if (shot.setup) await shot.setup(page);
    if (!shot.allowLoading) {
      // Wait out transient "Loading …" placeholders; a persistent one is a
      // fixture gap worth reporting rather than a reason to fail the shot.
      result.stillLoading = await page
        .waitForFunction(
          () =>
            ![...document.querySelectorAll('body *')].some(
              (element) =>
                [...element.childNodes].some(
                  (node) =>
                    node.nodeType === Node.TEXT_NODE &&
                    /^\s*Loading\b/u.test(node.textContent ?? ''),
                ) && element.getClientRects().length > 0,
            ),
          undefined,
          { timeout: 8000, polling: 200 },
        )
        .then(() => undefined)
        .catch(() => true);
    }
    if (!shot.keepPointer) await page.mouse.move(0, VIEWPORTS[width] ?? 900);
    const file = join(outDir, theme, String(width), `${shot.surface}--${shot.state}.png`);
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });
    result.file = relative(outDir, file).replaceAll('\\', '/');
    result.ok = true;
    if (theme === 'light' || theme === 'dark')
      result.themeGaps = await page.evaluate(themeGaps, theme);
    result.dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    result.horizontalOverflow = result.dimensions.width > width + 1;
  } catch (error) {
    result.ok = false;
    result.reason = String(error?.message ?? error).split('\n')[0];
  }
  if (errors.length) result.pageErrors = [...new Set(errors)].slice(0, 5);
  await context.close();
  return result;
}

function renderReport(manifest) {
  const lines = [];
  const shots = manifest.shots;
  const captured = shots.filter((shot) => shot.ok);
  lines.push('# Screenshot capture', '');
  lines.push(
    `Commit \`${manifest.commit}\`, ${manifest.generatedAt}. ${captured.length}/${shots.length} captures, ` +
      `widths ${manifest.widths.join(', ')}, themes ${manifest.themes.join(', ')}.`,
    '',
  );
  const failed = shots.filter((shot) => !shot.ok);
  if (failed.length) {
    lines.push(
      '## Not captured',
      '',
      '| Surface | State | Theme | Width | Reason |',
      '|---|---|---|---|---|',
    );
    for (const shot of failed) {
      lines.push(
        `| ${shot.surface} | ${shot.state} | ${shot.theme} | ${shot.width} | ${shot.reason.replaceAll('|', '\\|').slice(0, 140)} |`,
      );
    }
    lines.push('');
  }
  for (const theme of manifest.themes) {
    const gaps = captured.filter((shot) => shot.theme === theme && shot.themeGaps?.length);
    if (!gaps.length) continue;
    lines.push(
      `## ${theme === 'light' ? 'Light' : 'Dark'}-mode surface gaps`,
      '',
      `Large surfaces painted with ${theme === 'light' ? 'near-black' : 'near-white'} backgrounds in ${theme} mode (largest first, one row per surface and state, widest width).`,
      '',
      '| Surface | State | Element | Background | Viewport % |',
      '|---|---|---|---|---|',
    );
    const seen = new Set();
    for (const shot of gaps.sort((a, b) => b.width - a.width)) {
      for (const gap of shot.themeGaps) {
        const key = `${shot.surface}/${shot.state}/${gap.what}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(
          `| ${shot.surface} | ${shot.state} | \`${gap.what.replaceAll('|', '/')}\` | ${gap.background} | ${gap.areaPercent} |`,
        );
      }
    }
    lines.push('');
  }
  const overflow = captured.filter((shot) => shot.horizontalOverflow);
  const loading = captured.filter((shot) => shot.stillLoading);
  if (loading.length) {
    lines.push(
      '## Still loading when captured',
      '',
      'A "Loading…" placeholder stayed visible for 8 s; usually a fixture endpoint the capture stack does not serve.',
      '',
      '| Surface | State | Theme | Width |',
      '|---|---|---|---|',
    );
    for (const shot of loading)
      lines.push(`| ${shot.surface} | ${shot.state} | ${shot.theme} | ${shot.width} |`);
    lines.push('');
  }
  if (overflow.length) {
    lines.push(
      '## Horizontal overflow',
      '',
      '| Surface | State | Theme | Width | Document width |',
      '|---|---|---|---|---|',
    );
    for (const shot of overflow)
      lines.push(
        `| ${shot.surface} | ${shot.state} | ${shot.theme} | ${shot.width} | ${shot.dimensions.width} |`,
      );
    lines.push('');
  }
  const errors = captured.filter((shot) => shot.pageErrors);
  if (errors.length) {
    lines.push('## Page errors', '');
    for (const shot of errors)
      lines.push(
        `- ${shot.surface}/${shot.state} (${shot.theme}, ${shot.width}): ${shot.pageErrors.join('; ')}`,
      );
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function showDecisionCard(stack, card) {
  const response = await fetch(`${stack.fixtureEndpoint}/__test/decision-cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card }),
  });
  if (!response.ok) throw new Error(`decision card ${card} failed: ${response.status}`);
}

async function main() {
  const stack = await startStack({ portOffset, fixedClock: FIXTURE_TIME });
  const browser = await chromium.launch();
  try {
    log(`stack on ${stack.baseURL} (service ${stack.endpoint})`);
    await applyScenario(stack, {});
    const filters = only.split(',').filter(Boolean);
    const all = catalogue(await discover(browser, stack));
    const catalogueMaxWidth = new Map(
      all
        .filter((shot) => shot.maxWidth)
        .map((shot) => [`${shot.surface}--${shot.state}`, shot.maxWidth]),
    );
    const shots = all.filter(
      (shot) =>
        !filters.length ||
        filters.some((filter) => `${shot.surface}--${shot.state}`.includes(filter)),
    );
    log(`${shots.length} states × ${widths.length} widths × ${themes.length} themes`);
    const results = [];
    let scenarioKey = JSON.stringify([{}, 'default']);
    // Group by scenario so the fixture is reset once per scale data set.
    const fixtureKey = (shot) =>
      JSON.stringify([
        shot.scenario ?? {},
        shot.settingsModels ?? 'default',
        shot.fixtureDemo ?? '',
      ]);
    const ordered = [...shots].sort(
      (a, b) =>
        Number(Boolean(a.scenario)) - Number(Boolean(b.scenario)) ||
        Number(Boolean(a.settingsModels)) - Number(Boolean(b.settingsModels)) ||
        Number(Boolean(a.fixtureDemo)) - Number(Boolean(b.fixtureDemo)),
    );
    for (const shot of ordered) {
      const key = fixtureKey(shot);
      if (key !== scenarioKey) {
        await applyScenario(stack, shot.scenario ?? {});
        if (shot.settingsModels) {
          const seeded = await fetch(`${stack.fixtureEndpoint}/__test/settings-models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              typeof shot.settingsModels === 'string'
                ? { scenario: shot.settingsModels }
                : shot.settingsModels,
            ),
          });
          if (!seeded.ok) throw new Error(`settings seed failed: ${seeded.status}`);
        }
        if (shot.fixtureDemo) {
          const demo = await fetch(`${stack.fixtureEndpoint}/__test/${shot.fixtureDemo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          if (!demo.ok) throw new Error(`${shot.fixtureDemo} seed failed: ${demo.status}`);
        }
        scenarioKey = key;
      }
      if (shot.decision) await showDecisionCard(stack, shot.decision);
      for (const theme of themes) {
        for (const width of widths) {
          if (shot.maxWidth && width > shot.maxWidth) continue;
          const result = await capture(browser, stack, shot, { theme, width });
          results.push(result);
          if (!result.ok)
            log(`  skipped ${shot.surface}--${shot.state} ${theme} ${width}: ${result.reason}`);
        }
      }
      if (shot.decision) await applyScenario(stack, shot.scenario ?? {});
      log(`${shot.surface}--${shot.state}`);
    }
    const manifest = {
      generatedAt: new Date().toISOString(),
      commit: execSync('git rev-parse --short HEAD', { cwd: webRoot }).toString().trim(),
      frozenTime: FROZEN_TIME.toISOString(),
      widths,
      themes,
      viewports: Object.fromEntries(widths.map((width) => [width, VIEWPORTS[width]])),
      deviceScaleFactor: scale,
      shots: results,
    };
    const previous = join(outDir, 'screens-manifest.json');
    if (merge && existsSync(previous)) {
      // Replace the re-captured shots in an earlier manifest; keep the rest.
      const old = JSON.parse(readFileSync(previous, 'utf8'));
      const id = (shot) => `${shot.surface}--${shot.state}|${shot.theme}|${shot.width}`;
      const fresh = new Map(results.map((shot) => [id(shot), shot]));
      manifest.shots = [
        ...old.shots.map((shot) => fresh.get(id(shot)) ?? shot),
        ...results.filter((shot) => !old.shots.some((item) => id(item) === id(shot))),
      ].filter(
        (shot) =>
          !(
            shot.ok === false &&
            shot.width > (catalogueMaxWidth.get(`${shot.surface}--${shot.state}`) ?? Infinity)
          ),
      );
      manifest.widths = [...new Set([...old.widths, ...widths])].sort((a, b) => a - b);
      manifest.themes = [...new Set([...old.themes, ...themes])];
      manifest.viewports = { ...old.viewports, ...manifest.viewports };
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'screens-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(outDir, 'screens-report.md'), renderReport(manifest));
    const ok = results.filter((result) => result.ok).length;
    log(`${ok}/${results.length} captured -> ${outDir}`);
  } finally {
    await browser.close();
    await stack.stop();
  }
}

await main();
