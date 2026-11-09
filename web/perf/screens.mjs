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

async function press(page, role, name, options) {
  const target = control(page, role, name, options);
  const visible = await target
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
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

async function openFile(page, path) {
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
  await page
    .locator('[aria-label="Workspace file preview"]')
    .filter({ hasText: parts.at(-1) })
    .first()
    .waitFor();
  await page.waitForTimeout(800);
}

async function typeInComposer(page, text) {
  const composer = page.locator(COMPOSER).filter({ visible: true }).first();
  await composer.click();
  await page.keyboard.type(text);
}

// --- Shot catalogue ------------------------------------------------------------
//
// Each shot: {surface, state, url, setup?, ready?, scenario?, connected?, route?}.
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
        .getByRole('button', { name: /^Activity: / })
        .filter({ visible: true })
        .last()
        .click();
      await page.waitForTimeout(600);
    }),
    s('session', 'attention-technical-details', SESSION, async (page) => {
      await press(page, 'button', 'Technical details');
      await page.waitForTimeout(400);
    }),
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
    menu('menu-search-work', 'button', 'Search work'),
    menu('menu-create-or-import', 'button', 'Create or import'),
    menu('menu-workspace-actions', 'button', /^Workspace actions for /u),
    menu('menu-session-actions', 'button', /^Session actions for /u),
    menu('menu-attention-inbox', 'button', /needs your response/u),
    menu('menu-service-status', 'button', /^Workspace Service status/u),
    s('session', 'menu-clio-add-agent', SESSION, async (page) => {
      await press(page, 'button', /^Workspace Service status/u);
      await overlay(page);
      await page.getByRole('menuitem', { name: /^Add an agent/u }).click();
      await page.waitForTimeout(400);
    }),
    s('session', 'infrastructure-status-expanded', SESSION, async (page) => {
      await press(page, 'button', 'Show infrastructure status');
      await page.waitForTimeout(500);
    }),
    menu('menu-conversation-actions', 'button', /^Actions for /u),
    menu('menu-open-questions', 'button', /open question/u),
    menu('menu-version-status', 'button', /^Version status/u),
    menu('menu-usage', 'button', /^Usage for this conversation/u),
    menu('composer-model-picker', 'button', 'Change model'),
    menu('composer-reasoning-effort', 'button', /^Reasoning effort/u),
    menu('composer-execution-mode', 'button', /^Execution mode/u),
    menu('composer-confirmation-policy', 'button', /^Confirmation policy/u),
    menu('composer-permission-duration', 'combobox', 'Permission duration'),
    menu('composer-add-context', 'button', 'Add context'),
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
      await press(page, 'button', /^New session in /u);
      await overlay(page);
    }),
    s('session', 'dialog-new-workspace', SESSION, async (page) => {
      await press(page, 'button', /^New session in /u);
      await overlay(page);
      await press(page, 'tab', 'Workspace', { exact: true });
      await page.waitForTimeout(300);
    }),
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
    s('canvas', 'files-list', SESSION, (page) => stripList(page, 'Files')),
    s('canvas', 'file-csv', SESSION, (page) => openFile(page, 'results/stations.csv')),
    s('canvas', 'file-source', SESSION, (page) => openFile(page, 'scripts/regrid_stations.py')),
    s('canvas', 'file-diff', SESSION, async (page) => {
      await stripList(page, 'Activity');
      await page
        .getByRole('region', { name: 'Activity list' })
        .getByRole('button', { name: /regrid_stations\.py/u })
        .first()
        .click();
      await page.waitForTimeout(800);
    }),
    // A list chosen with a tab open: a sheet over the tab at the default
    // width, beside the tab once the pocket is wide (maximized).
    s('canvas', 'narrow-sheet', SESSION, async (page) => {
      await openFile(page, 'results/stations.csv');
      await stripList(page, 'Files');
    }),
    s('canvas', 'list-beside', SESSION, async (page) => {
      await openFile(page, 'results/stations.csv');
      await press(page, 'button', 'Maximize canvas');
      await page.waitForTimeout(600);
      await stripList(page, 'Files');
    }),
    s('canvas', 'file-image', SESSION, (page) =>
      openFile(page, 'results/vertical-displacement.png'),
    ),
    s('canvas', 'sources-list', SESSION, (page) => stripList(page, 'Sources')),
    s('canvas', 'artifacts-list', SESSION, (page) => stripList(page, 'Artifacts')),
    s('canvas', 'activity-list', SESSION, (page) => stripList(page, 'Activity')),
    // Work folds into Activity: a work row opens the Work tab; without
    // recorded work, the Timeline tab shows the session's work over time.
    s('canvas', 'work', SESSION, async (page) => {
      await stripList(page, 'Activity');
      const list = page.getByRole('region', { name: 'Activity list' });
      const work = list.locator('[data-kind="work"]').first();
      if (await work.count()) await work.click();
      else await list.getByRole('button', { name: 'Open timeline and context' }).click();
      await page.waitForTimeout(800);
    }),
    s('canvas', 'activity-detail', SESSION, async (page) => {
      await stripList(page, 'Activity');
      await page
        .getByRole('region', { name: 'Activity list' })
        .locator('[data-kind="tool"], [data-kind="turn"]')
        .first()
        .click();
      await page.waitForTimeout(800);
    }),
    s('canvas', 'agent', SESSION, (page) => stripList(page, 'Agent')),
    s('canvas', 'agent-customize', SESSION, async (page) => {
      await press(page, 'button', 'Customize the agent');
      await page.waitForTimeout(800);
    }),
    s('canvas', 'maximized', SESSION, async (page) => {
      await openCanvas(page);
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
      await press(page, 'button', 'Change', { exact: true });
      await overlay(page);
    }),
    s('settings', 'search-everywhere', '/settings/general', async (page) => {
      await press(page, 'button', 'Search everywhere');
      await overlay(page);
    }),
    s('runs', 'executions', '/runs', null, { ready: 'h1' }),
    s('runs', 'flows', '/runs', async (page) => {
      await press(page, 'radio', /^Flows/u);
      await page.waitForTimeout(500);
    }),
    s('runs', 'state-filter', '/runs', async (page) => {
      // Wide bars show the states as a segmented control; narrow ones a select.
      const select = page.getByRole('combobox', { name: 'Filter by state' });
      if (await select.isVisible()) {
        await select.click();
        await overlay(page);
      } else {
        await press(page, 'radio', /^Needs attention/u);
        await page.waitForTimeout(400);
      }
    }),
    s('runs', 'details', '/runs', async (page) => {
      await page
        .getByRole('button', { name: /^Details for/u })
        .first()
        .click();
      await overlay(page);
    }),
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
    s('scale', 'large-csv', SESSION, (page) => openFile(page, 'perf/large-table.csv'), {
      scenario: { files: 2000, largeFileBytes: 2 * 1024 * 1024 },
    }),
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

async function newContext(browser, stack, { theme, width, connected = true }) {
  const mobile = width < 600;
  const context = await browser.newContext({
    viewport: { width, height: VIEWPORTS[width] ?? 900 },
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: theme === 'light' ? 'light' : 'dark',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
  });
  context.setDefaultTimeout(6000);
  await context.clock.setFixedTime(FROZEN_TIME);
  await context.addInitScript(
    ({ theme, endpoint }) => {
      try {
        localStorage.setItem('clio.appearance.v1', JSON.stringify({ theme, motion: 'reduced' }));
        if (endpoint) localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
        else localStorage.removeItem('clio.recent-connections');
      } catch {
        // Opaque-origin frames have no storage.
      }
    },
    { theme, endpoint: connected === true ? stack.endpoint : connected || null },
  );
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
  });
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
    await page.mouse.move(0, VIEWPORTS[width] ?? 900);
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
    let scenarioKey = '{}';
    // Group by scenario so the fixture is reset once per scale data set.
    const ordered = [...shots].sort(
      (a, b) => Number(Boolean(a.scenario)) - Number(Boolean(b.scenario)),
    );
    for (const shot of ordered) {
      const key = JSON.stringify(shot.scenario ?? {});
      if (key !== scenarioKey) {
        await applyScenario(stack, shot.scenario ?? {});
        scenarioKey = key;
      }
      for (const theme of themes) {
        for (const width of widths) {
          if (shot.maxWidth && width > shot.maxWidth) continue;
          const result = await capture(browser, stack, shot, { theme, width });
          results.push(result);
          if (!result.ok)
            log(`  skipped ${shot.surface}--${shot.state} ${theme} ${width}: ${result.reason}`);
        }
      }
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
