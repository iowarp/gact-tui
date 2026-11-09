// Spec-left / implementation-right comparison of every decision-card state.
//
//   cd web
//   npx vite --config tests/review/vite.config.ts --port <port>   (another terminal)
//   node tests/review/conversation-cards-compare.mjs --base http://127.0.0.1:<port> [--out <dir>]
//     [--states a,b] [--widths 1280,768] [--themes dark,light]
//
// The fixture page (conversation-cards.html) owns the state list and which spec
// cell each state pairs with. The spec only defines dark tokens, so its crop is
// always dark and the label says so for light runs.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: `http://127.0.0.1:${process.env.CLIO_REVIEW_PORT ?? '5262'}` },
    out: {
      type: 'string',
      default:
        process.env.CLIO_REVIEW_OUTPUT ??
        resolve(
          homedir(),
          '.copilot/session-state/0fefcfe3-8455-408e-a305-686a11b7782d/files/s6-compare',
        ),
    },
    states: { type: 'string' },
    widths: { type: 'string', default: '1280,768' },
    themes: { type: 'string', default: 'dark,light' },
  },
});

const SPEC_URL = pathToFileURL(
  resolve(import.meta.dirname, '../../../docs/design/visual-language/conversation-states.html'),
).href;
const SPEC_VIEWPORT = { width: 1680, height: 1050 };
const SCALE = 2;
const page = (base, query) =>
  `${base.replace(/\/$/u, '')}/tests/review/conversation-cards.html?${new URLSearchParams(query)}`;

await mkdir(values.out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: SCALE });
  const tab = await context.newPage();
  tab.on('pageerror', (error) => errors.push(`${tab.url()}: ${error.message}`));
  return tab;
}

async function settle(tab) {
  await tab.waitForSelector('html[data-review-ready="true"]', {
    state: 'attached',
    timeout: 20_000,
  });
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(400);
}

/** The spec cell whose caption is `title`, captured once per run. */
const specShots = new Map();
async function specShot(title) {
  if (specShots.has(title)) return specShots.get(title);
  const tab = await newPage(SPEC_VIEWPORT);
  await tab.goto(SPEC_URL);
  await tab.evaluate(() => document.fonts.ready);
  const handle = await tab.evaluateHandle((name) => {
    const captions = [...document.querySelectorAll('.cap2 > b, .nmh > b')];
    const caption = captions.find((node) => node.textContent?.trim() === name);
    return caption?.closest('.cell, .x6 > div, .mblk, .fr') ?? null;
  }, title);
  const cell = handle.asElement();
  if (!cell) throw new Error(`Spec cell "${title}" was not found in ${SPEC_URL}`);
  await cell.scrollIntoViewIfNeeded();
  const shot = await cell.screenshot({ animations: 'disabled' });
  await tab.context().close();
  specShots.set(title, shot);
  return shot;
}

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
const escape = (text) =>
  text.replace(
    /[&<>"]/gu,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char],
  );

async function compose(tab, { spec, implementation, title, specLabel }) {
  await tab.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#202020;color:#eee;font:13px system-ui,sans-serif}
    .page{width:max-content;min-width:100vw}
    .strip{display:flex;gap:16px;padding:8px 16px;background:#111;border-bottom:1px solid #333}
    .strip b{font-weight:600}
    .row{display:flex;gap:24px;padding:16px;align-items:flex-start}
    .col{display:flex;flex-direction:column;gap:6px}
    .col span{color:#aaa;font-size:12px}
    img{display:block;outline:1px dashed #555}
  </style></head><body><div class="page">
    <div class="strip"><b>${escape(title)}</b></div>
    <div class="row">
      <div class="col"><span>${escape(specLabel)}</span><img id="spec" src="${dataUrl(spec)}"></div>
      <div class="col"><span>implementation</span><img id="impl" src="${dataUrl(implementation)}"></div>
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
  await probe.goto(page(values.base, { state: '__list' }));
  await settle(probe);
  const known = (await probe.evaluate(() => document.documentElement.dataset.reviewStates)).split(
    ',',
  );
  await probe.context().close();
  const states = values.states ? values.states.split(',') : known;
  const composer = await newPage({ width: 800, height: 600 });
  for (const state of states) {
    for (const width of values.widths.split(',').map(Number)) {
      for (const theme of values.themes.split(',')) {
        // One retry absorbs a dev-server reload while card components are edited.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            produced.push(await captureState(composer, state, width, theme));
            break;
          } catch (error) {
            if (attempt === 2) {
              errors.push(`${state} ${width} ${theme}: ${error.message.split('\n')[0]}`);
            }
          }
        }
      }
    }
  }
} finally {
  await browser.close();
}

async function captureState(composer, state, width, theme) {
  const tab = await newPage({ width, height: 1000 });
  try {
    await tab.goto(page(values.base, { state, theme }));
    await settle(tab);
    const { spec, closest, open } = await tab.evaluate(() => ({
      spec: document.documentElement.dataset.reviewSpec,
      closest: document.documentElement.dataset.reviewClosest === 'true',
      open: document.documentElement.dataset.reviewOpen,
    }));
    if (open) {
      await tab.getByRole('button', { name: open }).first().click();
      await tab.waitForTimeout(300);
    }
    const target = tab.locator('[data-review-capture]').first();
    const implementation = await target.screenshot({ animations: 'disabled' });
    const specLabel = [
      `spec: ${spec}`,
      closest ? '(closest cell, no exact spec state)' : '',
      theme === 'dark' ? '' : '(dark, the spec has no light theme)',
    ]
      .filter(Boolean)
      .join(' ');
    const file = resolve(values.out, `${state}--${width}--${theme}.png`);
    await writeFile(
      file,
      await compose(composer, {
        spec: await specShot(spec),
        implementation,
        specLabel,
        title: `${state} | ${width}px | ${theme}`,
      }),
    );
    console.log(file);
    return file;
  } finally {
    await tab.context().close();
  }
}
await writeFile(
  resolve(values.out, 'review.json'),
  JSON.stringify({ base: values.base, produced, errors }, null, 2),
);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
