// One-command performance and resource harness.
//
//   pnpm perf                      web (Chromium) against the deterministic fixture
//   pnpm perf -- --desktop         also the Tauri desktop app (WebView2 over CDP)
//   pnpm perf -- --quick           one repetition, shorter idle windows
//   pnpm perf -- --scenarios huge-conversation,large-files
//   pnpm perf -- --out ../docs/perf/baseline
//   pnpm perf -- --rebudget ../docs/perf/baseline/perf-report.json --out ../docs/perf/baseline
//                                  re-evaluate a report against budgets.json without measuring
//
// Writes perf-report.json (every measurement) and perf-report.md (summary and
// budget verdicts) to --out (default web/test-results/perf). See
// docs/perf-and-screens.md.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { cdpMetrics, installPerfObservers, percentile, round } from './instrument.mjs';
import {
  composerJourney,
  coldLoad,
  exploreJourney,
  fileViewerJourney,
  headerJourney,
  railJourney,
  idle,
  loadEarlier,
  marks,
  MESSAGE,
  queueJourney,
  Recorder,
  SESSION_URL,
  settingsJourney,
  shellJourney,
  transcriptJourney,
  workbenchJourney,
} from './journeys.mjs';
import { browserPids, cpuBetween, pidForPort, sampleGroups } from './process-sampler.mjs';
import { applyScenario, drainRequests, startStack, webRoot } from './stack.mjs';
import { renderMarkdown } from './report.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const quick = flag('quick');
const repeat = Number(option('repeat', quick ? 1 : 3));
const idleSeconds = Number(option('idle', quick ? 8 : 20));
const outDir = resolve(webRoot, option('out', 'test-results/perf'));
const viewport = { width: 1440, height: 900 };
const HUGE_MESSAGES = Number(option('huge-messages', 5000));
const budgets = JSON.parse(readFileSync(join(webRoot, 'perf', 'budgets.json'), 'utf8'));

const allScenarios = ['interactions', 'huge-conversation', 'many-sessions', 'large-files'];
const selected = option('scenarios', allScenarios.join(',')).split(',');

function log(message) {
  console.log(`[perf ${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function newPage(browser, endpoint) {
  const context = await browser.newContext({ viewport });
  // A control that cannot be pressed costs seconds, not the 30 s default.
  context.setDefaultTimeout(5000);
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    } catch {
      // Opaque-origin frames have no storage.
    }
  }, endpoint);
  await context.addInitScript(installPerfObservers);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  return { context, page, cdp, errors };
}

function requestSummary(requests) {
  const api = requests.filter((entry) => entry.path.startsWith('/v1/'));
  const byRoute = new Map();
  for (const entry of api) {
    const route = entry.path
      .replace(/sess_[a-z0-9_]+/gu, '{session}')
      .replace(/ws_[a-z0-9_]+/gu, '{workspace}')
      .replace(/(artifacts|resources|tools|questions|approvals)\/[^/]+/gu, '$1/{id}');
    const row = byRoute.get(route) ?? { route, count: 0, bytes: 0 };
    row.count += 1;
    row.bytes += entry.bytes;
    byRoute.set(route, row);
  }
  const unbounded = api.filter((entry) => entry.unboundedTranscript);
  return {
    count: api.length,
    kb: Math.round(api.reduce((sum, entry) => sum + entry.bytes, 0) / 1024),
    unboundedTranscriptReads: unbounded.length,
    unboundedTranscriptMessages: unbounded.reduce((sum, entry) => sum + (entry.messages ?? 0), 0),
    unbounded: unbounded.map((entry) => `${entry.path}${entry.query}`).slice(0, 10),
    topRoutes: [...byRoute.values()]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 8)
      .map((row) => ({ ...row, kb: Math.round(row.bytes / 1024), bytes: undefined })),
  };
}

async function processGroups(browser, stack, extra = {}) {
  const pids = await browserPids(browser);
  const browserPid = pids.find((row) => row.type === 'browser')?.pid;
  return {
    browser: browserPid ?? pids.map((row) => row.pid),
    renderers: pids.filter((row) => row.type === 'renderer').map((row) => row.pid),
    'fixture backend': stack.pids?.fixture,
    ...extra,
  };
}

// --- Scenarios -------------------------------------------------------------

async function runInteractions(browser, stack) {
  await applyScenario(stack, {});
  const { page, cdp, errors, context } = await newPage(browser, stack.endpoint);
  const r = new Recorder(page, cdp, 'interactions');
  await drainRequests(stack);
  await coldLoad(r, `${stack.baseURL}${SESSION_URL}`, marks.base);
  const loadRequests = requestSummary(await drainRequests(stack));
  const groups = await processGroups(browser, stack);
  const { cpuStart: idleStart, cpuEnd: idleEnd } = await idle(r, idleSeconds, () =>
    sampleGroups(groups),
  );
  for (let round_ = 0; round_ < repeat; round_ += 1) {
    log(`interactions round ${round_ + 1}/${repeat}`);
    await shellJourney(r);
    await headerJourney(r);
    await railJourney(r);
    await composerJourney(r);
  }
  await transcriptJourney(r);
  await workbenchJourney(r);
  await fileViewerJourney(r, ['results/stations.csv']);
  await settingsJourney(r);
  await exploreJourney(r);
  await queueJourney(r, {
    reload: async () => {
      await fetch(`${stack.fixtureEndpoint}/__test/queue-demo`, { method: 'POST' });
      await r.page.goto(`${stack.baseURL}${SESSION_URL}`);
      await r.visible(r.page.locator('[data-slot="composer-queue"]'), 15_000);
    },
    append: () => fetch(`${stack.fixtureEndpoint}/__test/queue-append`, { method: 'POST' }),
  });
  const end = await cdpMetrics(cdp, { gc: true });
  const after = await sampleGroups(groups);
  const requests = requestSummary(await drainRequests(stack));
  await context.close();
  return {
    steps: r.steps,
    loadRequests,
    requests,
    errors,
    endMetrics: end,
    processes: {
      idle: idleEnd.groups,
      idleCpuPercent: cpuBetween(idleStart, idleEnd),
      afterJourneys: after.groups,
    },
  };
}

async function runHugeConversation(browser, stack) {
  await applyScenario(stack, { messages: HUGE_MESSAGES, toolsPerMessage: 2 });
  const last = `msg_perf_${String(HUGE_MESSAGES - 1).padStart(6, '0')}`;
  const { page, cdp, errors, context } = await newPage(browser, stack.endpoint);
  const r = new Recorder(page, cdp, 'huge-conversation');
  // In-app switch from another conversation: the tail first-paint budget.
  await coldLoad(r, `${stack.baseURL}${SESSION_URL}`, marks.base);
  await page.waitForTimeout(1000);
  await drainRequests(stack);
  const link = page
    .getByRole('link', { name: /^Long campaign transcript/u })
    .filter({ visible: true })
    .first();
  await r.measure(
    'switch to huge conversation (tail first paint)',
    'conversation-switch',
    () => link.click(),
    { css: `[data-message-id="${last}"]` },
    { control: link, timeoutMs: 30_000 },
  );
  await page.waitForTimeout(2000);
  const switchRequests = requestSummary(await drainRequests(stack));
  const groups = await processGroups(browser, stack);
  const idleSample = await sampleGroups(groups);
  const tailHeap = await cdpMetrics(cdp, { gc: true });
  await loadEarlier(r, 'scroll up', quick ? 5 : 15);
  const scrolledHeap = await cdpMetrics(cdp, { gc: true });
  const scrollSample = await sampleGroups(groups);
  const scrollRequests = requestSummary(await drainRequests(stack));
  // Away and back: does the app retain or refetch the whole conversation?
  const base = page
    .getByRole('link', { name: /^EarthScope NDP evidence review/u })
    .filter({ visible: true })
    .first();
  await r.measure(
    'switch away to base conversation',
    'conversation-switch',
    () => base.click(),
    { css: MESSAGE },
    {
      control: base,
      timeoutMs: 15_000,
    },
  );
  await page.waitForTimeout(1500);
  await r.measure(
    'switch back to huge conversation',
    'conversation-switch',
    () => link.click(),
    { css: `[data-message-id="${last}"]` },
    { control: link, timeoutMs: 30_000 },
  );
  await page.waitForTimeout(1500);
  const returnHeap = await cdpMetrics(cdp, { gc: true });
  const returnRequests = requestSummary(await drainRequests(stack));
  // Cold load straight into the huge conversation.
  const cold = await newPage(browser, stack.endpoint);
  const rc = new Recorder(cold.page, cold.cdp, 'huge-conversation');
  await coldLoad(rc, `${stack.baseURL}/workspaces/ws_flat_ndp/sessions/sess_perf_huge`, {
    ...marks.huge,
    tail: `[data-message-id="${last}"]`,
  });
  const coldRequests = requestSummary(await drainRequests(stack));
  await cold.context.close();
  await context.close();
  return {
    steps: [...r.steps, ...rc.steps],
    errors: [...errors, ...cold.errors],
    heap: {
      tailMB: tailHeap.jsHeapUsedMB,
      tailNodes: tailHeap.nodes,
      scrolledMB: scrolledHeap.jsHeapUsedMB,
      scrolledNodes: scrolledHeap.nodes,
      returnMB: returnHeap.jsHeapUsedMB,
      returnNodes: returnHeap.nodes,
    },
    requests: {
      switch: switchRequests,
      scroll: scrollRequests,
      return: returnRequests,
      cold: coldRequests,
    },
    processes: { tail: idleSample.groups, scrolled: scrollSample.groups },
  };
}

async function runManySessions(browser, stack) {
  const scenario = { sessions: 2000, workspaces: 50 };
  await applyScenario(stack, scenario);
  const { page, cdp, errors, context } = await newPage(browser, stack.endpoint);
  const r = new Recorder(page, cdp, 'many-sessions');
  await coldLoad(r, `${stack.baseURL}${SESSION_URL}`, marks.base);
  const loadRequests = requestSummary(await drainRequests(stack));
  const groups = await processGroups(browser, stack);
  const loaded = await sampleGroups(groups);
  const sidebarRows = await page
    .locator('nav[aria-label="Workspace navigation"] a[href*="/sessions/"]')
    .count();
  await shellJourney(r);
  const search = page
    .getByRole('button', { name: 'Search work' })
    .filter({ visible: true })
    .first();
  await r.measure(
    'search work with 2000 conversations',
    'picker',
    () => search.click(),
    { overlay: true },
    {
      control: search,
    },
  );
  const query = 'station';
  for (let index = 0; index < query.length; index += 1) {
    await r.measure(
      `search keypress ${index + 1}`,
      'keypress',
      () => page.keyboard.press(query[index]),
      { css: '[role="dialog"] input, [role="combobox"]', minLength: index + 1 },
      { timeoutMs: 3000 },
    );
  }
  await page.keyboard.press('Escape');
  const sideScroll = page.locator('nav[aria-label="Workspace navigation"]').first();
  await sideScroll.hover().catch(() => undefined);
  const scrollStart = performance.now();
  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(50);
  }
  const scrollMs = performance.now() - scrollStart;
  const heap = await cdpMetrics(cdp, { gc: true });
  const requests = requestSummary(await drainRequests(stack));
  await context.close();
  return {
    scenario,
    steps: r.steps,
    errors,
    sidebarRows,
    sidebarScrollWallMs: Math.round(scrollMs),
    heap: { MB: heap.jsHeapUsedMB, nodes: heap.nodes },
    loadRequests,
    requests,
    processes: { loaded: loaded.groups },
  };
}

async function runLargeFiles(browser, stack) {
  const scenario = { files: 5000, largeFileBytes: 20 * 1024 * 1024 };
  await applyScenario(stack, scenario);
  const { page, cdp, errors, context } = await newPage(browser, stack.endpoint);
  const r = new Recorder(page, cdp, 'large-files');
  await coldLoad(r, `${stack.baseURL}${SESSION_URL}`, marks.base);
  await drainRequests(stack);
  const before = await cdpMetrics(cdp, { gc: true });
  const menu = page
    .getByRole('button', { name: 'Open a canvas tab' })
    .filter({ visible: true })
    .first();
  const open = page
    .getByRole('button', { name: 'Open workspace canvas' })
    .filter({ visible: true })
    .first();
  if (await r.visible(open, 1500)) await open.click();
  const filesButton = page
    .getByRole('toolbar', { name: 'Workbench lists' })
    .getByRole('button', { name: 'Files', exact: true })
    .filter({ visible: true })
    .first();
  if (await r.visible(filesButton, 1500)) {
    // Measure showing the list, not a list that is already up.
    if ((await filesButton.getAttribute('aria-pressed')) === 'true') {
      await filesButton.click();
      await page.waitForTimeout(300);
    }
    await r.measure(
      'file explorer with 5000 files',
      'tab',
      () => filesButton.click(),
      { css: '[role="treeitem"]', text: 'perf' },
      { control: filesButton, timeoutMs: 20_000 },
    );
  } else if (await r.visible(menu)) {
    await menu.click();
    const explorer = page
      .getByRole('menuitem', { name: /^File explorer/u })
      .filter({ visible: true })
      .first();
    await r.measure(
      'file explorer with 5000 files',
      'tab',
      () => explorer.click(),
      { css: '[role="treeitem"]', text: 'perf' },
      { control: explorer, timeoutMs: 20_000 },
    );
  }
  const sampleFile = async (step) => {
    const metrics = await cdpMetrics(cdp, { gc: true });
    const settled = await sampleGroups(await processGroups(browser, stack));
    step.settled = {
      heapMB: metrics.jsHeapUsedMB,
      nodes: metrics.nodes,
      rendererRssMB: settled.groups.renderers?.rssMB,
    };
  };
  await fileViewerJourney(r, [
    { path: 'perf/batch-000/sample-00000.csv', after: sampleFile },
    { path: 'perf/large-table.csv', content: 'P001', after: sampleFile },
    { path: 'perf/large-log.txt', content: 'INFO worker-0 processed chunk 0', after: sampleFile },
  ]);
  await page.waitForTimeout(2000);
  const after = await cdpMetrics(cdp, { gc: true });
  const groups = await processGroups(browser, stack);
  const sample = await sampleGroups(groups);
  const requests = requestSummary(await drainRequests(stack));
  await context.close();
  return {
    scenario,
    steps: r.steps,
    errors,
    heap: { beforeMB: before.jsHeapUsedMB, afterMB: after.jsHeapUsedMB, nodes: after.nodes },
    requests,
    processes: { afterFiles: sample.groups },
  };
}

// --- Desktop -----------------------------------------------------------------

async function runDesktop(stack) {
  const exe = resolve(
    webRoot,
    '..',
    option(
      'desktop-exe',
      join(
        'desktop',
        'src-tauri',
        'target',
        'debug',
        `clio-desktop${process.platform === 'win32' ? '.exe' : ''}`,
      ),
    ),
  );
  if (!existsSync(exe)) return { skipped: `desktop executable not found: ${exe}` };
  if (process.platform !== 'win32')
    return { skipped: 'desktop CDP attach is implemented for WebView2 (Windows)' };
  const cdpPort = Number(option('desktop-cdp-port', 9339));
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: 'ignore',
    windowsHide: false,
  });
  const result = { exe: exe.replace(resolve(webRoot, '..'), '.'), steps: [] };
  let browser;
  let recorder;
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
        break;
      } catch {
        await new Promise((resolve_) => setTimeout(resolve_, 500));
      }
    }
    if (!browser) throw new Error('WebView2 DevTools endpoint did not open');
    const context = browser.contexts()[0];
    let page = context.pages()[0];
    for (let attempt = 0; !page && attempt < 40; attempt += 1) {
      await new Promise((resolve_) => setTimeout(resolve_, 250));
      page = context.pages()[0];
    }
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/^https?:/u, { timeout: 30_000 });
    const origin = new URL(page.url()).origin;
    result.origin = origin;
    await page.waitForTimeout(3000);
    const startup = await sampleGroups({ desktop: child.pid });
    result.startupProcesses = startup.groups;
    await context.addInitScript(installPerfObservers);
    await page.evaluate((endpoint) => {
      localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    }, stack.endpoint);
    await applyScenario(stack, {});
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const r = new Recorder(page, cdp, 'desktop');
    recorder = r;
    await coldLoad(r, `${origin}${SESSION_URL}`, marks.base);
    const { cpuStart: idleStart, cpuEnd: idleEnd } = await idle(r, idleSeconds, () =>
      sampleGroups({ desktop: child.pid }),
    );
    result.idleProcesses = idleEnd.groups;
    result.idleCpuPercent = cpuBetween(idleStart, idleEnd);
    result.journeyErrors = {};
    for (const [name, journey] of Object.entries({
      shell: shellJourney,
      header: headerJourney,
      composer: composerJourney,
      workbench: workbenchJourney,
    })) {
      try {
        await journey(r);
      } catch (error) {
        result.journeyErrors[name] = String(error?.message ?? error).split('\n')[0];
        await page.keyboard.press('Escape').catch(() => undefined);
      }
    }
    result.afterJourneyProcesses = (await sampleGroups({ desktop: child.pid })).groups;
    // Huge conversation in the desktop webview.
    await applyScenario(stack, { messages: HUGE_MESSAGES, toolsPerMessage: 2 });
    const last = `msg_perf_${String(HUGE_MESSAGES - 1).padStart(6, '0')}`;
    await coldLoad(r, `${origin}/workspaces/ws_flat_ndp/sessions/sess_perf_huge`, {
      ...marks.huge,
      tail: `[data-message-id="${last}"]`,
    });
    await loadEarlier(r, 'desktop scroll up', quick ? 3 : 10);
    result.hugeProcesses = (await sampleGroups({ desktop: child.pid })).groups;
    result.hugeHeap = await cdpMetrics(cdp, { gc: true });
  } catch (error) {
    result.error = String(error?.message ?? error).split('\n')[0];
  } finally {
    result.steps = recorder?.steps ?? [];
    await browser?.close().catch(() => undefined);
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
  return result;
}

// --- Live backend --------------------------------------------------------------

async function runLive(browser, endpoint, sessionUrl) {
  const backendPort = Number(new URL(endpoint).port || 80);
  const backendPid = Number(option('backend-pid', 0)) || (await pidForPort(backendPort));
  const { page, cdp, errors, context } = await newPage(browser, endpoint);
  const r = new Recorder(page, cdp, 'live');
  const groups = {
    ...(await processGroups(browser, { pids: {} })),
    backend: backendPid ?? undefined,
  };
  const before = await sampleGroups(groups);
  await coldLoad(r, `${option('base-url', 'http://127.0.0.1:5181')}${sessionUrl}`, {
    shell: marks.base.shell,
    conversation: MESSAGE,
  });
  const { cpuStart: idleStart, cpuEnd: idleEnd } = await idle(r, idleSeconds, () =>
    sampleGroups(groups),
  );
  await shellJourney(r);
  await composerJourney(r);
  await transcriptJourney(r);
  await settingsJourney(r);
  const after = await sampleGroups(groups);
  await context.close();
  return {
    steps: r.steps,
    errors,
    backendPid,
    processes: {
      before: before.groups,
      idle: idleEnd.groups,
      idleCpuPercent: cpuBetween(idleStart, idleEnd),
      afterJourneys: after.groups,
    },
  };
}

// --- Summary and budgets -----------------------------------------------------------

function summarize(steps) {
  const byCategory = {};
  for (const step of steps) {
    if (!step.ok || typeof step.readyMs !== 'number') continue;
    const row = (byCategory[step.category] ??= {
      ready: [],
      event: [],
      longTaskMs: 0,
      n: 0,
      cls: 0,
    });
    row.ready.push(step.readyMs);
    if (typeof step.eventMs === 'number') row.event.push(step.eventMs);
    row.longTaskMs += step.longTaskMs ?? 0;
    row.cls += step.cls ?? 0;
    row.n += 1;
  }
  return Object.fromEntries(
    Object.entries(byCategory).map(([category, row]) => [
      category,
      {
        n: row.n,
        readyP50: round(percentile(row.ready, 50)),
        readyP95: round(percentile(row.ready, 95)),
        readyMax: round(Math.max(...row.ready)),
        eventP95: round(percentile(row.event, 95)),
        longTaskMs: round(row.longTaskMs),
        cls: round(row.cls, 4),
      },
    ]),
  );
}

function evaluateBudgets(report) {
  const verdicts = [];
  const add = (id, label, actual, budget, unit) => {
    if (actual === undefined || actual === null || budget === undefined) {
      verdicts.push({ id, label, actual: null, budget, unit, pass: null });
      return;
    }
    verdicts.push({ id, label, actual: round(actual), budget, unit, pass: actual <= budget });
  };
  const all = Object.values(report.scenarios).flatMap((scenario) => scenario.steps ?? []);
  const web = all.filter((step) => step.scenario !== 'desktop' && step.scenario !== 'live');
  const summary = summarize(web);
  for (const [category, budget] of Object.entries(budgets.interactionReadyP95Ms)) {
    add(`ready.${category}`, `${category} ready p95`, summary[category]?.readyP95, budget, 'ms');
  }
  add(
    'event.p95',
    'interaction event duration p95 (all)',
    percentile(
      web.map((step) => step.eventMs),
      95,
    ),
    budgets.eventDurationP95Ms,
    'ms',
  );
  add(
    'longtask.max',
    'longest task during an interaction',
    Math.max(0, ...web.map((step) => step.maxLongTaskMs ?? 0)),
    budgets.maxLongTaskMs,
    'ms',
  );
  add(
    'cls.interaction',
    'unexpected layout shift per interaction (max)',
    Math.max(0, ...web.filter((step) => step.category !== 'load').map((step) => step.cls ?? 0)),
    budgets.maxInteractionCls,
    '',
  );
  add(
    'cls.coldLoad',
    'layout shift during a cold load (max)',
    Math.max(0, ...web.filter((step) => step.category === 'load').map((step) => step.cls ?? 0)),
    budgets.maxColdLoadCls,
    '',
  );
  const interactions = report.scenarios.interactions;
  const coldBase = interactions?.steps.find((step) => step.category === 'load');
  add(
    'load.conversation',
    'cold load: conversation painted',
    coldBase?.marks?.conversation,
    budgets.coldLoadConversationMs,
    'ms',
  );
  const huge = report.scenarios['huge-conversation'];
  const tail = huge?.steps.find((step) => step.name.startsWith('switch to huge'));
  add(
    'huge.tail',
    `huge conversation (${HUGE_MESSAGES} msgs): tail first paint (in-app)`,
    tail?.readyMs,
    budgets.conversationTailFirstPaintMs,
    'ms',
  );
  const hugeCold = huge?.steps.find(
    (step) => step.category === 'load' && step.name.includes('sess_perf_huge'),
  );
  add(
    'huge.cold',
    'huge conversation: cold load to tail painted',
    hugeCold?.marks?.tail,
    budgets.coldLoadConversationMs,
    'ms',
  );
  const older = huge?.steps
    .filter((step) => step.name.startsWith('scroll up') && step.ok)
    .map((step) => step.readyMs);
  add(
    'huge.older',
    'huge conversation: older page on scroll p95',
    percentile(older ?? [], 95),
    budgets.olderPageP95Ms,
    'ms',
  );
  add(
    'huge.unbounded',
    'huge conversation: unbounded transcript reads',
    huge
      ? Object.values(huge.requests).reduce((sum, row) => sum + row.unboundedTranscriptReads, 0)
      : undefined,
    budgets.unboundedTranscriptReads,
    'reads',
  );
  const idleStep = interactions?.steps.find((step) => step.category === 'idle');
  add('heap.idle', 'web JS heap idle (after GC)', idleStep?.heapMB, budgets.webHeapIdleMB, 'MB');
  add(
    'heap.huge',
    'web JS heap with huge conversation scrolled',
    huge?.heap.scrolledMB,
    budgets.webHeapHugeMB,
    'MB',
  );
  add(
    'heap.manySessions',
    'web JS heap with 2000 conversations',
    report.scenarios['many-sessions']?.heap.MB,
    budgets.webHeapIdleMB,
    'MB',
  );
  add(
    'heap.largeFiles',
    'web JS heap after opening 20 MB files',
    report.scenarios['large-files']?.heap.afterMB,
    budgets.webHeapHugeMB,
    'MB',
  );
  const fileSteps = (report.scenarios['large-files']?.steps ?? []).filter((step) => step.settled);
  if (fileSteps.length) {
    add(
      'nodes.largeFile',
      'DOM nodes with a 20 MB file open (max)',
      Math.max(...fileSteps.map((step) => step.settled.nodes ?? 0)),
      budgets.domNodesLargeFile,
      'nodes',
    );
    add(
      'rss.largeFile',
      'web renderer RSS with a 20 MB file open (max)',
      Math.max(...fileSteps.map((step) => step.settled.rendererRssMB ?? 0)),
      budgets.webRendererRssLargeFileMB,
      'MB',
    );
  }
  add(
    'nodes.huge',
    'DOM nodes with huge conversation scrolled',
    huge?.heap.scrolledNodes,
    budgets.domNodesHuge,
    'nodes',
  );
  add(
    'heap.idleGrowth',
    `heap growth over ${idleSeconds}s idle`,
    idleStep?.heapGrowthMB,
    budgets.idleHeapGrowthMB,
    'MB',
  );
  add(
    'cpu.idle',
    'renderer CPU while idle on a running conversation',
    interactions?.processes.idleCpuPercent.renderers,
    budgets.idleRendererCpuPercent,
    '% core',
  );
  add(
    'rss.webRenderer',
    'web renderer RSS idle',
    interactions?.processes.idle.renderers?.rssMB,
    budgets.webRendererRssIdleMB,
    'MB',
  );
  const desktop = report.scenarios.desktop;
  add(
    'rss.desktopIdle',
    'desktop total RSS idle (host + WebView2)',
    desktop?.idleProcesses?.desktop?.rssMB,
    budgets.desktopRssIdleMB,
    'MB',
  );
  add(
    'rss.desktopHuge',
    'desktop total RSS with huge conversation',
    desktop?.hugeProcesses?.desktop?.rssMB,
    budgets.desktopRssHugeMB,
    'MB',
  );
  const live = report.scenarios.live;
  add(
    'rss.backendIdle',
    'backend RSS idle (live)',
    live?.processes.idle.backend?.rssMB,
    budgets.backendRssIdleMB,
    'MB',
  );
  return { summary, verdicts };
}

// --- Main --------------------------------------------------------------------------------

async function main() {
  mkdirSync(outDir, { recursive: true });
  const live = option('endpoint', null);
  const report = {
    generatedAt: new Date().toISOString(),
    machine: {
      platform: process.platform,
      cpus: cpus().length,
      cpuModel: cpus()[0]?.model,
      memoryGB: Math.round(totalmem() / 2 ** 30),
    },
    options: { repeat, idleSeconds, hugeMessages: HUGE_MESSAGES, viewport, quick },
    commit: await gitHead(),
    budgetsFile: 'web/perf/budgets.json',
    scenarios: {},
  };
  const browser = await chromium.launch();
  report.browser = browser.version();
  let stack;
  try {
    if (live) {
      log(`live endpoint ${live}`);
      report.scenarios.live = await runLive(browser, live, option('session-url', SESSION_URL));
    } else {
      stack = await startStack();
      log(`stack: preview ${stack.baseURL}, overlay ${stack.endpoint}`);
      const runners = {
        interactions: runInteractions,
        'huge-conversation': runHugeConversation,
        'many-sessions': runManySessions,
        'large-files': runLargeFiles,
      };
      for (const name of selected) {
        if (!runners[name]) continue;
        log(`scenario ${name}`);
        const started = performance.now();
        report.scenarios[name] = await runners[name](browser, stack);
        report.scenarios[name].wallSeconds = Math.round((performance.now() - started) / 1000);
      }
      if (flag('desktop')) {
        log('scenario desktop');
        report.scenarios.desktop = await runDesktop(stack);
      }
      report.processes = {
        helpers: (
          await sampleGroups({
            'scale overlay': stack.pids.proxy,
            'vite preview': stack.pids.preview,
          })
        ).groups,
      };
    }
  } finally {
    await browser.close();
    await stack?.stop();
  }
  const { summary, verdicts } = evaluateBudgets(report);
  report.summary = summary;
  report.budgets = verdicts;
  finish(report);
}

function finish(report) {
  const verdicts = report.budgets;
  writeFileSync(join(outDir, 'perf-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, 'perf-report.md'), renderMarkdown(report, budgets));
  const failed = verdicts.filter((verdict) => verdict.pass === false);
  log(
    `wrote ${join(outDir, 'perf-report.md')} — ${verdicts.filter((v) => v.pass).length} within budget, ${failed.length} over`,
  );
  for (const verdict of failed)
    log(`  over: ${verdict.label} ${verdict.actual} ${verdict.unit} (budget ${verdict.budget})`);
  if (flag('strict') && failed.length) process.exitCode = 1;
}

async function gitHead() {
  try {
    const { execFileSync } = await import('node:child_process');
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: webRoot })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const rebudget = option('rebudget', null);
if (rebudget) {
  // Re-evaluate an earlier report against the current budgets.json without re-measuring.
  const report = JSON.parse(readFileSync(resolve(webRoot, rebudget), 'utf8'));
  const { summary, verdicts } = evaluateBudgets(report);
  report.summary = summary;
  report.budgets = verdicts;
  finish(report);
} else {
  await main();
}
