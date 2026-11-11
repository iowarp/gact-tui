// Spec-left / implementation-right comparison of the toast states.
//
//   cd web
//   npx vite --config tests/review/vite.config.ts --port <port>   (another terminal)
//   node tests/review/toasts-compare.mjs --base http://127.0.0.1:<port> --out <dir>
//     [--states a,b] [--widths 1280,768,390] [--themes dark,light]
//
// toasts.html owns the state list. The spec defines dark tokens only, so its
// crop is always dark and the label says so for light runs.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: `http://127.0.0.1:${process.env.CLIO_REVIEW_PORT ?? '5212'}` },
    out: { type: 'string', default: process.env.CLIO_REVIEW_OUTPUT ?? 'toasts-compare' },
    states: { type: 'string' },
    widths: { type: 'string', default: '1280,768' },
    themes: { type: 'string', default: 'dark,light' },
  },
});

const SPEC_URL = pathToFileURL(
  resolve(import.meta.dirname, '../../../docs/design/visual-language/conversation-states.html'),
).href;
const SCALE = 2;
const PAD = 16;
const page = (query) =>
  `${values.base.replace(/\/$/u, '')}/tests/review/toasts.html?${new URLSearchParams(query)}`;

await mkdir(values.out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: SCALE });
  const tab = await context.newPage();
  tab.on('pageerror', (error) => errors.push(`${tab.url()}: ${error.message}`));
  return tab;
}

const specShots = new Map();
async function specShot(title) {
  if (specShots.has(title)) return specShots.get(title);
  const tab = await newPage({ width: 1680, height: 1050 });
  await tab.goto(SPEC_URL);
  await tab.evaluate(() => document.fonts.ready);
  const handle = await tab.evaluateHandle((name) => {
    const caption = [...document.querySelectorAll('.cap2 > b')].find(
      (node) => node.textContent?.trim() === name,
    );
    return caption?.closest('.cell') ?? null;
  }, title);
  const cell = handle.asElement();
  if (!cell) throw new Error(`Spec cell "${title}" was not found`);
  await cell.scrollIntoViewIfNeeded();
  const shot = await cell.screenshot({ animations: 'disabled' });
  await tab.context().close();
  specShots.set(title, shot);
  return shot;
}

/** The page's top, from the header down past the last toast. */
async function implementationShot(tab, width) {
  const box = await tab.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-sonner-toast]')].map((row) =>
      row.getBoundingClientRect(),
    );
    return {
      left: Math.min(...rows.map((row) => row.left)),
      right: Math.max(...rows.map((row) => row.right)),
      bottom: Math.max(...rows.map((row) => row.bottom)),
    };
  });
  const x = Math.max(0, box.left - PAD * 2);
  const right = Math.min(width, box.right + PAD * 2);
  return tab.screenshot({
    animations: 'disabled',
    clip: { x, y: 0, width: right - x, height: box.bottom + PAD },
  });
}

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

async function compose(tab, { spec, implementation, title, specLabel }) {
  await tab.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#202020;color:#eee;font:13px system-ui,sans-serif}
    .page{width:max-content;min-width:100vw}
    .strip{padding:8px 16px;background:#111;border-bottom:1px solid #333;font-weight:600}
    .row{display:flex;gap:24px;padding:16px;align-items:flex-start}
    .col{display:flex;flex-direction:column;gap:6px}
    .col span{color:#aaa;font-size:12px}
    img{display:block;outline:1px dashed #555}
  </style></head><body><div class="page">
    <div class="strip">${title}</div>
    <div class="row">
      <div class="col"><span>${specLabel}</span><img src="${dataUrl(spec)}"></div>
      <div class="col"><span>implementation</span><img src="${dataUrl(implementation)}"></div>
    </div>
  </div></body></html>`);
  await tab.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.decode()));
    for (const image of document.images) image.style.width = `${image.naturalWidth / 2}px`;
  });
  return tab.screenshot({ fullPage: true });
}

const produced = [];
try {
  const probe = await newPage({ width: 800, height: 600 });
  await probe.goto(page({ state: 'stack' }));
  await probe.waitForSelector('html[data-review-ready="true"]', { state: 'attached' });
  const known = (await probe.evaluate(() => document.documentElement.dataset.reviewStates)).split(
    ',',
  );
  await probe.context().close();
  const composer = await newPage({ width: 800, height: 600 });
  for (const state of values.states ? values.states.split(',') : known) {
    for (const width of values.widths.split(',').map(Number)) {
      for (const theme of values.themes.split(',')) {
        const tab = await newPage({ width, height: 600 });
        try {
          await tab.goto(page({ state, theme }));
          await tab.waitForSelector('html[data-review-ready="true"]', { state: 'attached' });
          await tab.evaluate(() => document.fonts.ready);
          const spec = await tab.evaluate(() => document.documentElement.dataset.reviewSpec);
          const file = resolve(values.out, `toasts-${state}--${width}--${theme}.png`);
          await writeFile(
            file,
            await compose(composer, {
              spec: await specShot(spec),
              implementation: await implementationShot(tab, width),
              specLabel: `spec: ${spec}${theme === 'dark' ? '' : ' (dark, the spec has no light theme)'}`,
              title: `toasts ${state} | ${width}px | ${theme}`,
            }),
          );
          produced.push(file);
          console.log(file);
        } catch (error) {
          errors.push(`${state} ${width} ${theme}: ${error.message.split('\n')[0]}`);
        } finally {
          await tab.context().close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
