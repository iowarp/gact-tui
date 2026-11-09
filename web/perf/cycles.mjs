#!/usr/bin/env node
// Memory cycles: open and close each surface N times and report what stays.
//
//   node perf/cycles.mjs [--cycles 10] [--only settings,command-menu] [--out dir]
//
// Each surface runs two warm-up cycles (lazy chunks, caches), then a forced GC
// baseline, N measured cycles and a forced GC sample. Growth that scales with
// N (heap, DOM nodes, listeners, detached nodes) is a leak; a fixed step after
// the warm-up is a cache. Serves web/dist like `pnpm perf`; build first.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { cdpMetrics, installPerfObservers, round } from './instrument.mjs';
import { fileViewerJourney, Recorder, SESSION_URL, MESSAGE } from './journeys.mjs';
import { applyScenario, startStack, webRoot } from './stack.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const cycles = Number(option('cycles', '10'));
const only = option('only', '')?.split(',').filter(Boolean);
// Heap snapshots before and after: names what the growth is made of.
const snapshots = args.includes('--snapshots');
const outDir = join(webRoot, option('out', 'test-results/perf-cycles'));
const viewport = { width: 1440, height: 900 };

const log = (message) =>
  console.log(`[cycles ${new Date().toISOString().slice(11, 19)}] ${message}`);
const settle = (page, ms = 400) => page.waitForTimeout(ms);

async function sample(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics = await cdpMetrics(cdp, { gc: true });
  const attached = await page.evaluate(() => document.getElementsByTagName('*').length);
  let detached;
  try {
    const result = await cdp.send('DOM.getDetachedDomNodes');
    detached = result.detachedNodes?.length ?? 0;
  } catch {
    detached = undefined;
  }
  return {
    heapMB: metrics.jsHeapUsedMB,
    nodes: metrics.nodes,
    attachedElements: attached,
    listeners: metrics.listeners,
    documents: metrics.documents,
    detached,
  };
}

async function snapshotSummary(cdp) {
  const chunks = [];
  const onChunk = ({ chunk }) => chunks.push(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const snapshot = JSON.parse(chunks.join(''));
  const meta = snapshot.snapshot.meta;
  const fields = meta.node_fields;
  const types = meta.node_types[0];
  const width = fields.length;
  const [typeAt, nameAt, sizeAt] = ['type', 'name', 'self_size'].map((f) => fields.indexOf(f));
  const groups = new Map();
  for (let index = 0; index < snapshot.nodes.length; index += width) {
    const type = types[snapshot.nodes[index + typeAt]];
    const name =
      type === 'string' || type === 'concatenated string' || type === 'sliced string'
        ? `(${type})`
        : `${type}:${snapshot.strings[snapshot.nodes[index + nameAt]]}`.slice(0, 120);
    const row = groups.get(name) ?? { count: 0, size: 0 };
    row.count += 1;
    row.size += snapshot.nodes[index + sizeAt];
    groups.set(name, row);
  }
  return groups;
}

function snapshotGrowth(before, after) {
  return [...after]
    .map(([name, row]) => ({
      name,
      count: row.count - (before.get(name)?.count ?? 0),
      kb: round((row.size - (before.get(name)?.size ?? 0)) / 1024),
    }))
    .filter((row) => row.kb > 4 || row.count > 50)
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 25);
}

async function escapeAll(page) {
  for (let index = 0; index < 3; index += 1) {
    if (!(await page.locator('[role="dialog"], [role="menu"]').filter({ visible: true }).count()))
      break;
    await page.keyboard.press('Escape');
    await settle(page, 150);
  }
}

async function sessionLinks(page) {
  const hrefs = await page
    .locator('a[href*="/sessions/sess_"]')
    .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href')))]);
  return hrefs.filter((href) => href && !href.endsWith('sess_perf_huge')).slice(0, 3);
}

const surfaces = {
  'session switch': async ({ page }) => {
    const hrefs = await sessionLinks(page);
    if (hrefs.length < 2) throw new Error('need two sessions in the sidebar');
    return async () => {
      for (const href of hrefs.slice(0, 2).reverse()) {
        await page.locator(`a[href="${href}"]`).filter({ visible: true }).first().click();
        await page.waitForURL((url) => url.pathname === href);
        await page.locator(MESSAGE).first().waitFor({ timeout: 15_000 });
        await settle(page);
      }
    };
  },
  settings:
    async ({ page }) =>
    async () => {
      await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
      await page.locator('[role="dialog"], [data-frame="window"]').first().waitFor();
      await page
        .locator('nav[aria-label="Settings sections"] a', { hasText: 'Models' })
        .first()
        .click();
      await settle(page);
      await page
        .locator('nav[aria-label="Settings sections"] a', { hasText: 'Appearance' })
        .first()
        .click();
      await settle(page);
      await page.keyboard.press('Escape');
      await page.locator(MESSAGE).first().waitFor({ timeout: 15_000 });
      await settle(page);
    },
  'command menu':
    async ({ page }) =>
    async () => {
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog').first().waitFor();
      await page.keyboard.type('stat', { delay: 20 });
      await settle(page, 300);
      await page.keyboard.press('Escape');
      await escapeAll(page);
      await settle(page);
    },
  'create menu': async ({ page }) => {
    const button = page
      .getByRole('button', { name: /^(Create or import|New session in )/u })
      .filter({ visible: true })
      .first();
    return async () => {
      await button.click();
      await page
        .locator('[role="dialog"], [role="menu"]')
        .filter({ visible: true })
        .first()
        .waitFor();
      await settle(page, 300);
      await page.keyboard.press('Escape');
      await escapeAll(page);
      await settle(page);
    };
  },
  'file viewers': async ({ page, r }) => {
    const open = page.getByRole('button', { name: 'Open workspace canvas' }).first();
    if (await open.isVisible().catch(() => false)) await open.click();
    await settle(page, 800);
    return async () => {
      await fileViewerJourney(r, [
        { path: 'results/stations.csv' },
        { path: 'perf/large-log.txt', content: 'INFO worker-0 processed chunk 0' },
      ]);
    };
  },
  infrastructure:
    async ({ page }) =>
    async () => {
      await page
        .getByRole('link', { name: /^Infrastructure/u })
        .filter({ visible: true })
        .first()
        .click();
      await page.waitForURL(/\/infrastructure/u);
      await settle(page, 600);
      for (const section of ['Services', 'Activity']) {
        const link = page
          .getByRole('link', { name: section, exact: true })
          .filter({ visible: true });
        if (await link.count()) {
          await link.first().click();
          await settle(page, 300);
        }
      }
      await page.goBack();
      if (/\/infrastructure/u.test(page.url())) await page.goBack();
      if (/\/infrastructure/u.test(page.url())) await page.goBack();
      await page.locator(MESSAGE).first().waitFor({ timeout: 15_000 });
      await settle(page);
    },
};

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const stack = await startStack();
  const results = [];
  try {
    // A few extra conversations so the sidebar has more than one to switch to.
    await applyScenario(stack, { sessions: 6 });
    for (const [name, setup] of Object.entries(surfaces)) {
      if (only?.length && !only.includes(name.replace(/ /gu, '-'))) continue;
      log(name);
      const context = await browser.newContext({ viewport });
      context.setDefaultTimeout(8000);
      await context.addInitScript((value) => {
        try {
          localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
        } catch {
          // Opaque-origin frames have no storage.
        }
      }, stack.endpoint);
      // The file journey measures through the harness observers; the other
      // surfaces run without them so their buffers never count as growth.
      if (name === 'file viewers') await context.addInitScript(installPerfObservers);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('DOM.enable').catch(() => undefined);
      const r = new Recorder(page, cdp, 'cycles');
      const row = { surface: name, cycles };
      try {
        await page.goto(`${stack.baseURL}${SESSION_URL}`);
        await page.locator(MESSAGE).first().waitFor({ timeout: 30_000 });
        await settle(page, 2000);
        const cycle = await setup({ page, cdp, r });
        for (let index = 0; index < 2; index += 1) await cycle();
        await settle(page, 1000);
        row.before = await sample(page, cdp);
        const heapBefore = snapshots ? await snapshotSummary(cdp) : undefined;
        const started = performance.now();
        for (let index = 0; index < cycles; index += 1) await cycle();
        row.cycleMs = Math.round((performance.now() - started) / cycles);
        await settle(page, 1500);
        row.after = await sample(page, cdp);
        if (heapBefore) row.retained = snapshotGrowth(heapBefore, await snapshotSummary(cdp));
        row.growth = Object.fromEntries(
          Object.keys(row.after).map((key) => [
            key,
            typeof row.after[key] === 'number' && typeof row.before[key] === 'number'
              ? round(row.after[key] - row.before[key])
              : undefined,
          ]),
        );
      } catch (error) {
        row.error = String(error?.message ?? error).split('\n')[0];
      }
      row.errors = errors.slice(0, 5);
      results.push(row);
      log(JSON.stringify(row.growth ?? row.error));
      await context.close();
    }
  } finally {
    await browser.close();
    await stack.stop();
  }
  const lines = [
    `# Memory cycles (${cycles} per surface, after forced GC)`,
    '',
    '| Surface | Heap before MB | Heap growth MB | Nodes growth | Listeners growth | Detached growth | ms per cycle |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map((row) =>
      row.error
        ? `| ${row.surface} | failed: ${row.error} | | | | | |`
        : `| ${row.surface} | ${row.before.heapMB} | ${row.growth.heapMB} | ${row.growth.nodes} | ${row.growth.listeners} | ${row.growth.detached ?? 'n/a'} | ${row.cycleMs} |`,
    ),
  ];
  writeFileSync(join(outDir, 'cycles.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(outDir, 'cycles.md'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

await main();
