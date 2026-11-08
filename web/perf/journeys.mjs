// Scripted journeys for the perf harness. Each journey presses the controls of
// one surface and records a measurement per interaction (see instrument.mjs).
// Controls are located by accessible role and name, the same way the e2e suite
// and a screen-reader user find them. A control that is not found is recorded
// as skipped instead of failing the run, so the report doubles as an inventory
// check when the UI changes.
import { cdpMetrics, round } from './instrument.mjs';

const OVERLAY = { overlay: true };
const MESSAGE = '[aria-label="Conversation"] [data-message-id]';
const COMPOSER = '[role="combobox"][aria-label^="Ask "]';
export const SESSION_URL = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
export const HUGE_URL = '/workspaces/ws_flat_ndp/sessions/sess_perf_huge';

export class Recorder {
  constructor(page, cdp, scenario) {
    this.page = page;
    this.cdp = cdp;
    this.scenario = scenario;
    this.steps = [];
  }

  async visible(locator, timeout = 3000) {
    try {
      await locator.first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  /** Measure one interaction. `action` performs the input; `spec` says what "ready" means. */
  async measure(
    name,
    category,
    action,
    spec,
    { close, timeoutMs = 10_000, control, target = control } = {},
  ) {
    const step = { scenario: this.scenario, name, category };
    if (control && !(await this.visible(control))) {
      this.steps.push({ ...step, skipped: 'control not found' });
      return step;
    }
    try {
      await this.page.evaluate(() =>
        document
          .querySelectorAll('[data-perf-target]')
          .forEach((element) => element.removeAttribute('data-perf-target')),
      );
      if (target) await target.evaluate((element) => element.setAttribute('data-perf-target', ''));
      await this.page.evaluate((value) => window.__perf.arm(value), spec);
      await action();
      Object.assign(
        step,
        await this.page.evaluate((value) => window.__perf.collect(value), { timeoutMs }),
      );
    } catch (error) {
      step.ok = false;
      step.reason = String(error?.message ?? error).split('\n')[0];
    }
    try {
      const metrics = await cdpMetrics(this.cdp);
      step.heapMB = metrics.jsHeapUsedMB;
      step.nodes = metrics.nodes;
    } catch {
      // The page navigated mid-sample.
    }
    for (const key of [
      'readyMs',
      'eventMs',
      'settleMs',
      'longTaskMs',
      'maxLongTaskMs',
      'loafBlockingMs',
    ]) {
      if (typeof step[key] === 'number') step[key] = round(step[key]);
    }
    if (typeof step.cls === 'number') step.cls = round(step.cls, 4);
    if (typeof step.clsWithInput === 'number') step.clsWithInput = round(step.clsWithInput, 4);
    this.steps.push(step);
    if (close) await this.close(close);
    return step;
  }

  async close(close) {
    try {
      if (close === 'Escape') {
        await this.page.keyboard.press('Escape');
        await this.page
          .waitForFunction(
            () =>
              ![
                ...document.querySelectorAll('[role="menu"],[role="dialog"],[role="listbox"]'),
              ].some((element) => element.getClientRects().length > 0),
            undefined,
            { timeout: 2000, polling: 100 },
          )
          .catch(async () => {
            await this.page.keyboard.press('Escape');
          });
      } else if (typeof close === 'function') {
        await close();
      }
    } catch {
      // A stuck overlay is visible in the next step's result.
    }
    await this.page.waitForTimeout(150);
  }

  /** The first visible control with this role and accessible name. */
  control(role, label, options = {}) {
    return this.page
      .getByRole(role, { name: label, ...options })
      .filter({ visible: true })
      .first();
  }

  /** Press a control by role/name and wait for a new menu/dialog/listbox. */
  async overlay(name, role, label, extra = {}) {
    const control = this.control(role, label);
    return this.measure(name, extra.category ?? 'menu', () => control.click(), OVERLAY, {
      close: 'Escape',
      control,
      ...extra,
    });
  }
}

async function waitIdle(page, ms = 600) {
  await page.waitForTimeout(ms);
}

/** Cold navigation: marks from navigation start, paint timings and heap. */
export async function coldLoad(recorder, url, marks, { settleMs = 3000 } = {}) {
  const { page, cdp } = recorder;
  await page.addInitScript((value) => {
    window.__PERF_MARKS__ = value;
  }, marks);
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const last = Object.keys(marks).at(-1);
  await page
    .waitForFunction((name) => window.__perf?.state.marks[name] !== undefined, last, {
      timeout: 60_000,
      polling: 100,
    })
    .catch(() => undefined);
  await page.waitForTimeout(settleMs);
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    return {
      marks: window.__perf.state.marks,
      totals: window.__perf.totals(),
      domContentLoaded: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      load: Math.round(navigation?.loadEventEnd ?? 0),
      transferKB: Math.round(
        performance
          .getEntriesByType('resource')
          .reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0) / 1024,
      ),
    };
  });
  const metrics = await cdpMetrics(cdp, { gc: true });
  const step = {
    scenario: recorder.scenario,
    name: `cold load ${url}`,
    category: 'load',
    ok: Object.keys(marks).every((name) => timing.marks[name] !== undefined),
    wallMs: Date.now() - started,
    marks: timing.marks,
    fcp: round(timing.totals.paints['first-contentful-paint']),
    lcp: round(timing.totals.paints.lcp),
    domContentLoaded: timing.domContentLoaded,
    transferKB: timing.transferKB,
    longTaskCount: timing.totals.longTaskCount,
    longTaskMs: round(timing.totals.longTaskMs),
    cls: round(timing.totals.cls, 4),
    domElements: timing.totals.domElements,
    heapMB: metrics.jsHeapUsedMB,
    nodes: metrics.nodes,
    listeners: metrics.listeners,
  };
  recorder.steps.push(step);
  return step;
}

// --- Base fixture journeys ---------------------------------------------------

export async function shellJourney(r) {
  const { page } = r;
  await r.overlay('search work (button)', 'button', 'Search work', { category: 'picker' });
  await r.measure(
    'search work (Ctrl+K)',
    'picker',
    () => page.keyboard.press('Control+k'),
    OVERLAY,
    {
      close: 'Escape',
    },
  );
  await r.overlay('create or import menu', 'button', 'Create or import');
  await r.overlay('workspace actions menu', 'button', /^Workspace actions for /u);
  await r.overlay('session row actions menu', 'button', /^Session actions for /u);
  await r.overlay('attention inbox', 'button', /needs your response/u);
  await r.overlay('service status menu', 'button', /^Workspace Service status/u);
  const infraStatus = r.control('button', 'Show infrastructure status');
  await r.measure('infrastructure status', 'toggle', () => infraStatus.click(), OVERLAY, {
    control: infraStatus,
    close: () => r.control('button', /infrastructure status/u).click(),
  });
  // The rail (also "Toggle Sidebar") sits under the navigation resize handle;
  // the header trigger is the control people press.
  const toggle = page.locator('button[data-sidebar="trigger"]').filter({ visible: true }).first();
  await r.measure(
    'collapse sidebar',
    'toggle',
    () => toggle.click(),
    { css: '[data-side="left"][data-state="collapsed"]', minCount: 1 },
    { control: toggle },
  );
  await r.measure(
    'expand sidebar',
    'toggle',
    () => page.locator('button[data-sidebar="trigger"]').filter({ visible: true }).first().click(),
    { css: '[data-side="left"][data-state="expanded"]', minCount: 1 },
  );
  const collapse = r.control('button', /^Collapse workspace /);
  await r.measure(
    'collapse workspace group',
    'toggle',
    () => collapse.click(),
    { css: 'button[aria-label^="Expand workspace "]' },
    { control: collapse },
  );
  const expand = r.control('button', /^Expand workspace /);
  await r.measure(
    'expand workspace group',
    'toggle',
    () => expand.click(),
    { css: 'button[aria-label^="Collapse workspace "]' },
    { control: expand },
  );
}

export async function headerJourney(r) {
  await r.overlay('conversation actions menu', 'button', /^Actions for /u);
  const customize = r.control('button', 'Customize the agent');
  await r.measure(
    'customize agent (canvas tab)',
    'tab',
    () => customize.click(),
    { css: '[aria-label="Workspace canvas"] [role="tab"][aria-selected="true"]', text: 'Agent' },
    { control: customize },
  );
  await r.overlay('open questions', 'button', /open question/u, { category: 'dialog' });
  await r.overlay('version status', 'button', /^Version status/u);
  await r.overlay('usage summary', 'button', /^Usage for this conversation/u);
}

export async function composerJourney(r) {
  const { page } = r;
  const composer = page.locator(COMPOSER).first();
  if (!(await r.visible(composer))) {
    r.steps.push({
      scenario: r.scenario,
      name: 'composer',
      category: 'keypress',
      skipped: 'control not found',
    });
    return;
  }
  await page.keyboard.press('Escape');
  await composer.click({ timeout: 5000 }).catch(() => composer.focus());
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  const text = 'Compare station coverage against the 2024 baseline';
  for (let index = 0; index < text.length; index += 1) {
    await r.measure(
      `keypress ${index + 1}`,
      'keypress',
      () => page.keyboard.press(text[index] === ' ' ? 'Space' : text[index]),
      { css: COMPOSER, minLength: index + 1 },
      { timeoutMs: 3000 },
    );
  }
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await r.measure('mention menu (@)', 'menu', () => page.keyboard.press('@'), OVERLAY, {
    target: composer,
    timeoutMs: 5000,
    close: async () => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Backspace');
    },
  });
  await r.measure('slash commands (/)', 'menu', () => page.keyboard.press('/'), OVERLAY, {
    close: async () => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Backspace');
    },
  });
  await r.overlay('model picker', 'button', 'Change model', { category: 'picker' });
  await r.overlay('reasoning effort', 'button', /^Reasoning effort/u);
  await r.overlay('execution mode', 'button', /^Execution mode/u);
  await r.overlay('confirmation policy', 'button', /^Confirmation policy/u);
}

export async function transcriptJourney(r) {
  const { page } = r;
  const activity = page.getByRole('button', { name: /^Activity: / }).last();
  if (await r.visible(activity)) {
    const expanded = (await activity.getAttribute('aria-expanded')) === 'true';
    await r.measure(
      'activity disclosure',
      'toggle',
      () => activity.click(),
      { css: `button[aria-label^="Activity: "][aria-expanded="${expanded ? 'false' : 'true'}"]` },
      { control: activity },
    );
  }
  await r.overlay('transcript outline', 'button', 'Open transcript outline', {
    category: 'dialog',
  });
  const jump = r.control('button', /^Jump to user message 2$/u);
  await r.measure(
    'minimap jump',
    'scroll',
    () => jump.click(),
    { css: MESSAGE },
    { control: jump },
  );
  await loadEarlier(r, 'load earlier (button)', 3, { optional: true });
}

/**
 * Load older transcript pages; each page is one measurement, from the press
 * (or wheel) to the `before=` page arriving and the DOM settling. The
 * transcript is virtualized and its minimap is capped, so neither counts
 * loaded messages. `optional` marks a conversation that may already be fully
 * loaded (no button and nothing arrives on scroll).
 */
export async function loadEarlier(r, label, pages, { optional = false } = {}) {
  const { page } = r;
  for (let index = 0; index < pages; index += 1) {
    const button = r.control('button', 'Load earlier messages');
    const hasButton = await r.visible(button, 1500);
    const step = await r.measure(
      `${label} page ${index + 1}`,
      'scroll',
      async () => {
        if (hasButton) await button.click();
        else {
          await page.locator('[aria-label="Conversation"]').first().hover();
          await page.mouse.wheel(0, -50_000);
        }
      },
      { resource: '/messages\\?.*before=' },
      { timeoutMs: 8000 },
    );
    step.via = hasButton ? 'button' : 'wheel';
    step.rendered = await page.locator(MESSAGE).count();
    if (!step.ok && optional && !hasButton) {
      delete step.ok;
      delete step.reason;
      step.skipped = 'fully loaded (no earlier page)';
    }
    if (!step.ok) break;
  }
}

export async function workbenchJourney(r) {
  const { page } = r;
  const open = r.control('button', 'Open workspace canvas');
  if (await r.visible(open, 1500)) {
    await r.measure(
      'open workspace canvas',
      'toggle',
      () => open.click(),
      { css: '[role="complementary"][aria-label="Workspace canvas"]' },
      { control: open },
    );
  }
  const activeTab = page
    .locator('[aria-label="Workspace canvas"] [role="tab"][aria-selected="true"]')
    .filter({ visible: true })
    .first();
  if (await r.visible(activeTab, 1500)) {
    await r.measure(
      'tab context menu',
      'menu',
      () => activeTab.click({ button: 'right' }),
      OVERLAY,
      { close: 'Escape', control: activeTab },
    );
  }
  const strip = page.getByRole('toolbar', { name: 'Workbench lists' });
  for (const item of ['Files', 'Sources', 'Artifacts', 'Activity']) {
    const button = strip.getByRole('button', { name: item, exact: true }).first();
    if (!(await r.visible(button))) break;
    if ((await button.getAttribute('aria-pressed')) === 'true') continue;
    await r.measure(
      `show list: ${item}`,
      'tab',
      () => button.click(),
      { css: `[aria-label="${item} list"]` },
      { control: button, close: undefined },
    );
  }
  const work = page
    .getByRole('region', { name: 'Activity list' })
    .getByRole('button', { name: /^Work/u })
    .first();
  if (await r.visible(work, 1000)) {
    await r.measure(
      'open canvas tab: Work',
      'tab',
      () => work.click(),
      { css: '[aria-label="Workspace canvas"] [role="tab"][aria-selected="true"]', text: 'Work' },
      { control: work, close: undefined },
    );
  }
  const agent = strip.getByRole('button', { name: 'Agent', exact: true }).first();
  if (await r.visible(agent, 1000)) {
    await r.measure(
      'open canvas tab: Agent',
      'tab',
      () => agent.click(),
      { css: '[aria-label="Workspace canvas"] [role="tab"][aria-selected="true"]', text: 'Agent' },
      { control: agent, close: undefined },
    );
  }
  const tabs = await page.locator('[aria-label="Workspace canvas"] [role="tab"]').all();
  for (const tab of tabs.slice(0, 8)) {
    const name = (await tab.textContent())?.trim() || 'tab';
    if ((await tab.getAttribute('aria-selected')) === 'true') continue;
    await r.measure(
      `switch canvas tab: ${name}`,
      'tab',
      () => tab.click(),
      { css: '[aria-label="Workspace canvas"] [role="tab"][aria-selected="true"]', text: name },
      { control: tab },
    );
  }
  const maximize = r.control('button', 'Maximize canvas');
  await r.measure(
    'maximize canvas',
    'toggle',
    () => maximize.click(),
    { css: 'button[aria-label="Maximize canvas"]', gone: true },
    { control: maximize },
  );
  await page.keyboard.press('Escape');
  const restore = r.control('button', /^(Restore|Exit|Minimize|Unmaximize)/u);
  if (await r.visible(restore, 1000)) await restore.click();
}

/**
 * Open files in the workbench. An entry is a path or `{ path, content, after }`:
 * `content` is text that only appears once the file body is rendered (the
 * preview header appears first), and `after(step)` samples resources once the
 * viewer has settled.
 */
export async function fileViewerJourney(r, entries) {
  const { page } = r;
  const filesButton = page
    .getByRole('toolbar', { name: 'Workbench lists' })
    .getByRole('button', { name: 'Files', exact: true })
    .filter({ visible: true })
    .first();
  if (
    (await r.visible(filesButton, 1000)) &&
    (await filesButton.getAttribute('aria-pressed')) !== 'true'
  ) {
    await filesButton.click();
    await waitIdle(page, 500);
  }
  const list = page.getByRole('region', { name: 'Files list' });
  for (const entry of entries) {
    const { path, content, after } = typeof entry === 'string' ? { path: entry } : entry;
    // Over a narrow panel the list steps aside after each pick; show it again.
    if (!(await r.visible(list, 300)) && (await r.visible(filesButton, 300))) {
      await filesButton.click();
      await waitIdle(page, 300);
    }
    const name = path.split('/').pop();
    for (const part of path.split('/').slice(0, -1)) {
      const folder = list
        .getByRole('button', { name: `Expand folder ${part}`, exact: true })
        .filter({ visible: true })
        .first();
      if (await r.visible(folder, 3000)) {
        await r.measure(
          `expand folder ${part}`,
          'tree',
          () => folder.click(),
          { css: `button[aria-label="Collapse folder ${part}"]` },
          { control: folder },
        );
      }
    }
    const file = list
      .locator('[role="treeitem"]:not([aria-expanded])')
      .filter({ hasText: name })
      .first();
    const preview = '[aria-label="Workspace file preview"]';
    const step = await r.measure(
      `open file ${name}`,
      'file',
      () => file.click(),
      content
        ? {
            all: [
              { css: preview, text: name },
              { css: preview, text: content },
            ],
          }
        : { css: preview, text: name },
      { control: file, timeoutMs: 60_000 },
    );
    await waitIdle(page, 1500);
    if (after) {
      try {
        await after(step);
      } catch (error) {
        step.afterError = String(error?.message ?? error).split('\n')[0];
      }
    }
  }
}

export async function settingsJourney(r) {
  const { page } = r;
  const link = r.control('link', 'Settings');
  await r.measure(
    'open settings',
    'navigation',
    () => link.click(),
    { css: 'h1', text: 'General' },
    { control: link },
  );
  const nav = await page.locator('nav a[href^="/settings/"]').all();
  const names = [];
  for (const item of nav) names.push(((await item.textContent()) ?? '').trim());
  for (const name of names) {
    if (!name || name === 'General') continue;
    const item = page.locator('nav a[href^="/settings/"]', { hasText: name }).first();
    // Not every settings page has an h1 yet (see the baseline report), so the
    // route commit is the nav's current-page mark plus the first content.
    const step = await r.measure(
      `settings: ${name}`,
      'navigation',
      () => item.click(),
      {
        all: [
          { css: 'nav a[aria-current="page"]', text: name },
          { css: 'main', changed: true },
        ],
      },
      { control: item, timeoutMs: 8000 },
    );
    step.headings = await page.locator('main h1').filter({ visible: true }).count();
    await waitIdle(page, 200);
    if (name === 'Models') {
      await r.overlay('default model picker', 'button', 'Change', { category: 'picker' });
    }
  }
  await r.overlay('settings search everywhere', 'button', 'Search everywhere', {
    category: 'picker',
  });
}

export async function exploreJourney(r) {
  const { page } = r;
  const back = r.control('link', 'Back to workspace');
  if (await r.visible(back, 1500)) await back.click();
  await waitIdle(page);
  const runs = r.control('link', 'Runs');
  await r.measure(
    'open runs',
    'navigation',
    () => runs.click(),
    { css: 'h1', text: 'Runs' },
    { control: runs },
  );
  // Run categories are a segmented control (radios) since the RC1 runs layout.
  for (const tab of ['Flows', 'Executions']) {
    const control = page.getByRole('radio', { name: new RegExp(`^${tab}`, 'u') }).first();
    await r.measure(
      `runs tab: ${tab}`,
      'tab',
      () => control.click(),
      { css: '[role="radio"][aria-checked="true"]', text: tab },
      { control },
    );
  }
  // Wide bars show the states as a segmented control; narrow ones a select.
  const stateSelect = r.control('combobox', 'Filter by state');
  if (await r.visible(stateSelect, 500)) {
    await r.overlay('runs state filter', 'combobox', 'Filter by state');
  } else {
    const attention = page.getByRole('radio', { name: /^Needs attention/u }).first();
    await r.measure(
      'runs state filter',
      'tab',
      () => attention.click(),
      { css: '[role="radio"][aria-checked="true"]', text: 'Needs attention' },
      { control: attention },
    );
  }
  await page.goBack();
  await waitIdle(page);
  const infra = r.control('link', /^Infrastructure/u);
  await r.measure(
    'open infrastructure',
    'navigation',
    () => infra.click(),
    { css: 'h1', text: 'Overview' },
    {
      control: infra,
    },
  );
  for (const section of [
    'Agent hosts',
    'Services',
    'Models & storage',
    'Tools',
    'Activity',
    'Overview',
  ]) {
    const control = r.control('link', section, { exact: true });
    await r.measure(
      `infrastructure: ${section}`,
      'navigation',
      () => control.click(),
      { css: 'h1', changed: true },
      { control, timeoutMs: 8000 },
    );
  }
  const home = r.control('link', /^(Workspace|Back to workspace)$/iu);
  await r.measure(
    'back to workspace (from infrastructure)',
    'navigation',
    () => home.click(),
    { css: COMPOSER },
    {
      control: home,
      timeoutMs: 15_000,
    },
  );
  if (!(await r.visible(page.locator(MESSAGE).first(), 3000))) {
    await page.goto(new URL('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp', page.url()).href);
  }
  await page.locator(MESSAGE).first().waitFor({ timeout: 30_000 });
  await waitIdle(page, 1000);
  const create = r.control('button', /^New session in /u);
  await r.measure('new session dialog', 'dialog', () => create.click(), OVERLAY, {
    control: create,
  });
  const workspaceTab = r.control('tab', 'Workspace', { exact: true });
  await r.measure(
    'create dialog: workspace tab',
    'tab',
    () => workspaceTab.click(),
    { css: '[role="dialog"] [role="tab"][aria-selected="true"]', text: 'Workspace' },
    { control: workspaceTab, close: 'Escape' },
  );
  await r.close('Escape');
}

/** Idle sampling: heap and renderer CPU while a running conversation stays open. */
export async function idle(r, seconds) {
  const before = await cdpMetrics(r.cdp, { gc: true });
  const start = await r.page.evaluate(() => window.__perf.totals());
  await r.page.waitForTimeout(seconds * 1000);
  const after = await cdpMetrics(r.cdp, { gc: true });
  const end = await r.page.evaluate(() => window.__perf.totals());
  const step = {
    scenario: r.scenario,
    name: `idle ${seconds}s`,
    category: 'idle',
    ok: true,
    heapBeforeMB: before.jsHeapUsedMB,
    heapMB: after.jsHeapUsedMB,
    heapGrowthMB: round(after.jsHeapUsedMB - before.jsHeapUsedMB),
    nodes: after.nodes,
    nodesGrowth: after.nodes - before.nodes,
    scriptMs: round(after.scriptMs - before.scriptMs),
    layoutCount: after.layoutCount - before.layoutCount,
    longTaskCount: end.longTaskCount - start.longTaskCount,
    longTaskMs: round(end.longTaskMs - start.longTaskMs),
  };
  r.steps.push(step);
  return step;
}

export const marks = {
  base: {
    shell: 'nav[aria-label="Workspace navigation"]',
    composer: COMPOSER,
    conversation: MESSAGE,
  },
  huge: {
    shell: 'nav[aria-label="Workspace navigation"]',
    composer: COMPOSER,
    tail: '[data-message-id="msg_perf_004999"]',
  },
};
export { MESSAGE, COMPOSER };
