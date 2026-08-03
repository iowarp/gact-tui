import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const LEAK_PATTERNS = [
  /\[\[\s*##/i,
  /\bworkflow_state\b/i,
  /\btyped\s+workflow[_ ]state\b/i,
  /\bstructured\s+state\b/i,
  /\bacquisition\.metadata_path\b/i,
  /\bacquisition\.analysis_ready\b/i,
  /\bmetadata_path\b/i,
  /\banalysis_ready\b/i,
  /_UnsupportedSessionAgent/i,
  /Cannot find home/i,
];

const EXPECTED_SEQUENCES = [
  {
    name: 'earthscope-initial-geospatial-data',
    rows: [
  { kind: 'agent', agent: 'main' },
  { kind: 'text', agent: 'main' },
  { kind: 'call', target: 'geospatial' },
  { kind: 'agent', agent: 'geospatial' },
  { kind: 'text', agent: 'geospatial' },
  { kind: 'tool', name: 'geo_geocode' },
  { kind: 'return', agent: 'geospatial', parent: 'main' },
  { kind: 'agent', agent: 'main' },
  { kind: 'call', target: 'data' },
  { kind: 'agent', agent: 'data' },
  { kind: 'call', target: 'ndp_dataset_discovery' },
  { kind: 'agent', agent: 'ndp_dataset_discovery' },
  { kind: 'tool', name: 'ndp_search_datasets' },
  { kind: 'tool', name: 'ndp_stage_resource' },
  { kind: 'return', agent: 'ndp_dataset_discovery', parent: 'data' },
  { kind: 'call', target: 'earthscope_station_catalog' },
  { kind: 'agent', agent: 'earthscope_station_catalog' },
  { kind: 'tool', name: 'geo_filter_points_by_radius' },
  { kind: 'return', agent: 'earthscope_station_catalog', parent: 'main' },
    ],
  },
  {
    name: 'earthscope-completed-data-synthesis',
    rows: [
      { kind: 'agent', agent: 'data' },
      { kind: 'call', target: 'ndp_dataset_discovery' },
      { kind: 'agent', agent: 'ndp_dataset_discovery' },
      { kind: 'tool', name: 'ndp_search_datasets' },
      { kind: 'tool', name: 'ndp_stage_resource' },
      { kind: 'return', agent: 'ndp_dataset_discovery', parent: 'data' },
      { kind: 'call', target: 'earthscope_station_catalog' },
      { kind: 'agent', agent: 'earthscope_station_catalog' },
      { kind: 'tool', name: 'geo_filter_points_by_radius' },
      { kind: 'return', agent: 'earthscope_station_catalog', parent: 'data' },
      { kind: 'return', agent: 'data', parent: 'main' },
      { kind: 'call', target: 'synthesis' },
      { kind: 'agent', agent: 'synthesis' },
      { kind: 'return', agent: 'synthesis', parent: 'main' },
    ],
  },
  {
    name: 'earthscope-completed-data-blocker',
    rows: [
      { kind: 'agent', agent: 'main' },
      { kind: 'text', agent: 'main' },
      { kind: 'call', target: 'geospatial' },
      { kind: 'agent', agent: 'geospatial' },
      { kind: 'text', agent: 'geospatial' },
      { kind: 'tool', name: 'geo_geocode' },
      { kind: 'return', agent: 'geospatial', parent: 'main' },
      { kind: 'agent', agent: 'main' },
      { kind: 'call', target: 'data' },
      { kind: 'agent', agent: 'data' },
      { kind: 'call', target: 'ndp_dataset_discovery' },
      { kind: 'agent', agent: 'ndp_dataset_discovery' },
      { kind: 'tool', name: 'ndp_search_datasets' },
      { kind: 'tool', name: 'ndp_stage_resource' },
      { kind: 'return', agent: 'ndp_dataset_discovery', parent: 'data' },
      { kind: 'call', target: 'earthscope_station_catalog' },
      { kind: 'agent', agent: 'earthscope_station_catalog' },
      { kind: 'tool', name: 'geo_filter_points_by_radius' },
      { kind: 'return', agent: 'earthscope_station_catalog', parent: 'data' },
      { kind: 'agent', agent: 'data' },
      { kind: 'call', target: 'earthscope_station_catalog' },
      { kind: 'agent', agent: 'earthscope_station_catalog' },
      { kind: 'tool', name: 'shell_bash' },
      { kind: 'return', agent: 'earthscope_station_catalog', parent: 'data' },
      { kind: 'agent', agent: 'data' },
      { kind: 'return', agent: 'data', parent: 'main' },
      { kind: 'agent', agent: 'main' },
      { kind: 'answer', agent: 'main' },
    ],
  },
];

function parseArgs(argv) {
  const opts = { html: '', out: '', assetRoot: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${arg} requires a value`);
      return next;
    };
    if (arg === '--html') opts.html = value();
    else if (arg === '--out') opts.out = value();
    else if (arg === '--asset-root') opts.assetRoot = value();
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/verify-transcript-render.mjs --html screenshots/run/reload.html [--out report.json] [--asset-root dist/assets]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.html) throw new Error('--html is required');
  opts.html = path.resolve(opts.html);
  opts.out = opts.out ? path.resolve(opts.out) : path.join(path.dirname(opts.html), 'render-verification.json');
  opts.assetRoot = path.resolve(opts.assetRoot || 'dist/assets');
  return opts;
}

function fileUrl(file) {
  return `file:///${file.replace(/\\/g, '/')}`;
}

function isMatch(row, expected) {
  return Object.entries(expected).every(([key, value]) => row[key] === value);
}

function findSubsequence(rows, expected) {
  const matches = [];
  let cursor = 0;
  for (const item of expected) {
    const found = rows.findIndex((row, index) => index >= cursor && isMatch(row, item));
    if (found < 0) return { ok: false, matches, missing: item };
    matches.push(found);
    cursor = found + 1;
  }
  return { ok: true, matches, missing: null };
}

function fingerprint(value) {
  return JSON.stringify(value);
}

const opts = parseArgs(process.argv.slice(2));
const htmlText = await fs.readFile(opts.html, 'utf8');
const htmlLeaks = [];
for (const pattern of [/\[\[\s*##/i, /_UnsupportedSessionAgent/i, /Cannot find home/i]) {
  const match = htmlText.match(pattern);
  if (match) htmlLeaks.push({ pattern: String(pattern), sample: match[0], surface: 'html' });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const assetMisses = [];
await page.route('**/assets/**', async (route) => {
  const url = new URL(route.request().url());
  const assetName = decodeURIComponent(path.basename(url.pathname));
  const localAsset = path.join(opts.assetRoot, assetName);
  try {
    await route.fulfill({ path: localAsset });
  } catch (error) {
    assetMisses.push({ url: route.request().url(), localAsset, error: String(error) });
    await route.abort();
  }
});
await page.goto(fileUrl(opts.html));

const report = await page.evaluate((expectedSequences) => {
  const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const styleOf = (node) => {
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      color: style.color,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
    };
  };
  const codeStyleOf = (node) => {
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      color: style.color,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      backgroundColor: style.backgroundColor,
      borderTopColor: style.borderTopColor,
    };
  };

  const rows = [...document.querySelectorAll('[data-testid="assistant-turn"] > *')].map((node) => {
    if (node.matches('[data-testid="assistant-turn-agent"]')) {
      return {
        kind: 'agent',
        agent: node.getAttribute('data-agent') || '',
        depth: Number(node.getAttribute('data-depth') || 0),
        text: textOf(node),
      };
    }
    if (node.matches('[data-testid="assistant-turn-step"]')) {
      const agent = node.getAttribute('data-agent') || '';
      return {
        kind: 'call',
        target: agent,
        depth: Number(node.getAttribute('data-depth') || 0),
        text: textOf(node),
      };
    }
    if (node.matches('[data-testid="assistant-turn-tool"]')) {
      return {
        kind: 'tool',
        name: textOf(node.querySelector('.trx-tool__name')),
        depth: Number(node.getAttribute('data-depth') || 0),
        text: textOf(node),
      };
    }
    if (node.matches('[data-testid="assistant-turn-return"]')) {
      const agents = [...node.querySelectorAll('.trx-row__agent')].map(textOf);
      return {
        kind: 'return',
        agent: agents[0] || node.getAttribute('data-agent') || '',
        parent: agents[1] || '',
        depth: Number(node.getAttribute('data-depth') || 0),
        text: textOf(node),
      };
    }
    if (node.matches('[data-testid="assistant-turn-answer"]')) {
      return {
        kind: 'answer',
        agent: node.getAttribute('data-agent') || '',
        depth: Number(node.getAttribute('data-depth') || 0),
        text: textOf(node),
      };
    }
    if (node.matches('[data-testid="assistant-turn-text"]')) {
      return {
        kind: 'text',
        agent: node.getAttribute('data-agent') || '',
        depth: Number(node.getAttribute('data-depth') || 0),
        text: textOf(node),
      };
    }
    return {
      kind: 'other',
      agent: node.getAttribute('data-agent') || '',
      depth: Number(node.getAttribute('data-depth') || 0),
      text: textOf(node),
    };
  });

  const firstTurn = document.querySelector('[data-testid="assistant-turn"]');
  let thoughtWasInjected = false;
  if (firstTurn && !document.querySelector('[data-testid="assistant-turn-tool-thought"]')) {
    thoughtWasInjected = true;
    const fixture = document.createElement('div');
    fixture.setAttribute('data-testid', 'assistant-turn-tool-thought');
    fixture.className = 'trx-row__body trx-tool__thought';
    fixture.innerHTML =
      '<div class="im"><p class="im__p"><span>I must call </span><code class="im__inline-code">geo_geocode</code><span> to resolve the place.</span></p></div>';
    firstTurn.appendChild(fixture);
  }

  const bodySamples = [
    ...document.querySelectorAll('[data-testid="assistant-turn-result"], [data-testid="assistant-turn-return-body"], [data-testid="assistant-turn-task"], [data-testid="assistant-turn-tool-thought"]'),
  ].map((node) => ({
    testid: node.getAttribute('data-testid') || '',
    className: node.className || '',
    text: textOf(node).slice(0, 160),
    body: styleOf(node),
    paragraph: styleOf(node.querySelector('.im__p') || node.querySelector('span')),
    code: codeStyleOf(node.querySelector('.im__inline-code')),
  }));

  return {
    rowCount: rows.length,
    rows,
    tools: rows.filter((row) => row.kind === 'tool').map((row) => row.name),
    calls: rows.filter((row) => row.kind === 'call').map((row) => row.target),
    returns: rows.filter((row) => row.kind === 'return').map((row) => `${row.agent}->${row.parent}`),
    expectedSequences,
    thoughtWasInjected,
    bodySamples,
    visibleLeaks: [...document.querySelectorAll('[data-testid="assistant-turn-result"], [data-testid="assistant-turn-return-body"], [data-testid="assistant-turn-answer"], [data-testid="assistant-turn-reasoning-body"], [data-testid="assistant-turn-tool-thought"]')]
      .flatMap((node) => {
        const text = textOf(node);
        return [
          /\[\[\s*##/i,
          /\bworkflow_state\b/i,
          /\btyped\s+workflow[_ ]state\b/i,
          /\bstructured\s+state\b/i,
          /\bacquisition\.metadata_path\b/i,
          /\bacquisition\.analysis_ready\b/i,
          /\bmetadata_path\b/i,
          /\banalysis_ready\b/i,
          /_UnsupportedSessionAgent/i,
          /Cannot find home/i,
        ].flatMap((pattern) => {
          const match = text.match(pattern);
          return match
            ? [{ pattern: String(pattern), sample: match[0], surface: node.getAttribute('data-testid') || '' }]
            : [];
        });
      }),
  };
}, EXPECTED_SEQUENCES);

await browser.close();

const orders = EXPECTED_SEQUENCES.map((sequence) => ({
  name: sequence.name,
  ...findSubsequence(report.rows, sequence.rows),
}));
const order = orders.find((candidate) => candidate.ok) || orders[0];
const badNestedReturns = report.rows.filter(
  (row) =>
    row.kind === 'return' &&
    (row.agent === 'ndp_dataset_discovery' || row.agent === 'earthscope_station_catalog') &&
    row.parent === 'main',
);
const baseBody = report.bodySamples.find((sample) => sample.testid === 'assistant-turn-tool-thought')?.body;
const baseCode = report.bodySamples.find((sample) => sample.testid === 'assistant-turn-tool-thought')?.code;
const styleFailures = [];
for (const sample of report.bodySamples) {
  if (sample.body && baseBody && fingerprint(sample.body) !== fingerprint(baseBody)) {
    styleFailures.push({ testid: sample.testid, className: sample.className, type: 'body', expected: baseBody, actual: sample.body });
  }
  if (sample.code && baseCode && fingerprint(sample.code) !== fingerprint(baseCode)) {
    styleFailures.push({ testid: sample.testid, className: sample.className, type: 'code', expected: baseCode, actual: sample.code });
  }
}

const result = {
  html: opts.html,
  assetRoot: opts.assetRoot,
  generatedAt: new Date().toISOString(),
  ok:
    htmlLeaks.length === 0 &&
    assetMisses.length === 0 &&
    order.ok &&
    badNestedReturns.length === 0 &&
    styleFailures.length === 0,
  htmlLeaks: [...htmlLeaks, ...report.visibleLeaks],
  assetMisses,
  order,
  acceptedOrders: orders,
  badNestedReturns,
  rowCount: report.rowCount,
  tools: report.tools,
  calls: report.calls,
  returns: report.returns,
  thoughtWasInjected: report.thoughtWasInjected,
  styleFailures,
  bodySamples: report.bodySamples,
  firstRows: report.rows.slice(0, 24),
  lastRows: report.rows.slice(-18),
};

await fs.writeFile(opts.out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
