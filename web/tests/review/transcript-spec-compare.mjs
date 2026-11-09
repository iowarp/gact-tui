// Spec-versus-implementation captures for the S5 transcript states.
//
//   node tests/review/transcript-spec-compare.mjs [--out <dir>] [--only a,b]
//        [--widths 1280,768] [--themes dark,light] [--spec-at-width]
//
// Left: a crop of docs/design/visual-language/conversation-states.html (dark only; light is
// a token-swapped approximation). Right: the same state rendered by production transcript
// components in tests/review/transcript-spec.tsx, served by Vite with the review config.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const web = resolve(import.meta.dirname, '../..');
const repo = resolve(web, '..');
const specFile = resolve(repo, 'docs/design/visual-language/conversation-states.html');
const defaultOut =
  'C:\\Users\\jaime\\.copilot\\session-state\\8cc1f9f4-699a-4841-ad04-0a9b49a16510\\files\\s5-compare';

const STATES = [
  'conversation',
  'activity-row',
  'info-dialog',
  'right-edge',
  'message',
  'inline-states',
  'narrow',
  'narrow-fifth',
  'compaction',
  'waiting',
];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  return value;
}
const list = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const out = resolve(option('out', process.env.CLIO_SPEC_COMPARE_OUT ?? defaultOut));
const only = list(option('only', STATES.join(',')));
const widths = list(option('widths', '1280,768')).map(Number);
const themes = list(option('themes', 'dark,light'));
const port = Number(process.env.CLIO_REVIEW_PORT ?? 5261);
// The spec page is not responsive: below these widths its mocks overlap or clip their own rows.
// Its mocks are fixed-size drawings, so they are laid out at least this wide unless
// --spec-at-width asks for the literal viewport.
const SPEC_LAYOUT = { narrow: 1600, 'narrow-fifth': 1600 };
const specLayoutMin = 1280;
const specAtWidth = process.argv.includes('--spec-at-width');
const specWidth = (state, width) =>
  specAtWidth ? width : Math.max(width, SPEC_LAYOUT[state] ?? specLayoutMin);
for (const state of only) if (!STATES.includes(state)) throw new Error(`Unknown state: ${state}`);
for (const theme of themes)
  if (!['dark', 'light'].includes(theme)) throw new Error(`Unknown theme: ${theme}`);

/** Our light tokens, written over the spec's dark :root so its token-driven parts flip. */
async function lightOverride() {
  const css = await readFile(resolve(web, 'src/theme/themes.css'), 'utf8');
  // The default light theme is the Notebook palette, the spec's own.
  const selector = /:root,\s*:root\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/u;
  const block = css.match(selector)?.[1] ?? '';
  const tokens = new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/gu)].map((match) => [match[1], match[2].trim()]),
  );
  const names = [
    'background',
    'foreground',
    'card',
    'popover',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'border',
    'input',
    'ring',
    'primary',
    'primary-foreground',
    'action',
    'sidebar',
    'destructive',
    'info',
    'success',
    'warning',
    'faint',
    'hover',
  ];
  const vars = names
    .filter((name) => tokens.has(name) && !tokens.get(name).includes('var('))
    .map((name) => `--${name}:${tokens.get(name)} !important;`)
    .join('');
  return `:root{${vars}} body{background:${tokens.get('background') ?? '#fff'} !important}`;
}

/**
 * Finds a spec state's element and returns its page-coordinate box. Runs in the spec page.
 * Captions (`.cap2 > b`) and section headings are the anchors; the box is the union of
 * what follows them, so the crop holds the state, not its label.
 */
function specBox(state) {
  const pad = 8;
  const NARROW_CAPTION = { narrow: 'A third of the window', 'narrow-fifth': 'A fifth' };
  const caption = (text) =>
    [...document.querySelectorAll('.cap2')].find(
      (node) => node.querySelector('b')?.textContent?.trim() === text,
    );
  const after = (node) => {
    const nodes = [];
    for (let next = node?.nextElementSibling; next; next = next.nextElementSibling)
      nodes.push(next);
    return nodes;
  };
  const transcriptOf = (root) => {
    const column = root?.querySelector('.xct');
    if (!column) return [];
    return [...column.children].filter((child) => !child.matches('.xdk, .xcp, .xa'));
  };
  let nodes = [];
  if (state === 'conversation' || state === 'waiting') {
    const heading = [...document.querySelectorAll('.sect2')].find(
      (node) => node.textContent?.trim() === 'In a conversation',
    );
    let block = heading?.nextElementSibling;
    while (block && !block.querySelector('.xct')) block = block.nextElementSibling;
    nodes = transcriptOf(block);
  } else if (state === 'activity-row') nodes = after(caption('In the transcript'));
  else if (state === 'info-dialog') nodes = after(caption('ⓘ opened'));
  else if (state === 'right-edge') nodes = after(caption('The right edge')).slice(0, 1);
  else if (state === 'message') nodes = after(caption('A message'));
  else if (state === 'inline-states' || state === 'compaction')
    nodes = after(caption('Inline, in the transcript'));
  else if (state === 'narrow' || state === 'narrow-fifth') {
    const mock = caption(NARROW_CAPTION[state])?.nextElementSibling;
    nodes = mock?.querySelector('.xct') ? transcriptOf(mock) : mock ? [mock] : [];
  }
  // Descendants too: column guides and badges overflow their row boxes.
  const visible = (node) => {
    const style = getComputedStyle(node);
    return style.visibility !== 'hidden' && style.opacity !== '0' && style.display !== 'none';
  };
  // Mock windows clip their overflow, so the crop must too.
  const frame = nodes[0]?.parentElement?.closest('.xc')?.getBoundingClientRect();
  const rects = nodes
    .flatMap((node) => [node, ...node.querySelectorAll('*')])
    .filter((node) => !node.matches('.cn') && visible(node))
    .map((node) => node.getBoundingClientRect())
    .map((rect) =>
      frame
        ? {
            left: Math.max(rect.left, frame.left),
            top: Math.max(rect.top, frame.top),
            right: Math.min(rect.right, frame.right),
            bottom: Math.min(rect.bottom, frame.bottom),
          }
        : rect,
    )
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  // Never reach back into the caption above the state.
  const ceiling = nodes[0]?.previousElementSibling?.matches('.cap2')
    ? nodes[0].previousElementSibling.getBoundingClientRect().bottom
    : -Infinity;
  const narrow = NARROW_CAPTION[state]
    ? caption(NARROW_CAPTION[state])?.nextElementSibling?.getBoundingClientRect().width
    : undefined;
  const first = Math.max(top - pad, ceiling);
  return {
    x: Math.max(0, left - pad + window.scrollX),
    y: Math.max(0, first + window.scrollY),
    width: right - left + pad * 2,
    height: bottom + pad - first,
    narrow,
  };
}

/** The rendered transcript's content box inside one review section. Runs in the review page. */
function implementationBox(state) {
  const pad = 8;
  const section = document.querySelector(`[data-spec-state="${state}"]`);
  const log = section?.querySelector('[role="log"]');
  if (!section || !log) return null;
  const rects = [...log.children]
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  const body = section.querySelector('[data-spec-body]').getBoundingClientRect();
  const left = Math.max(body.left, Math.min(...rects.map((rect) => rect.left)));
  const top = Math.max(body.top, Math.min(...rects.map((rect) => rect.top)));
  const right = Math.min(body.right, Math.max(...rects.map((rect) => rect.right)));
  const bottom = Math.min(body.bottom, Math.max(...rects.map((rect) => rect.bottom)));
  return {
    x: Math.max(0, left - pad + window.scrollX),
    y: Math.max(0, top - pad + window.scrollY),
    width: right - left + pad * 2,
    height: bottom - top + pad * 2,
  };
}

/** Screenshots a page-coordinate box through a transparent overlay element. */
async function shoot(page, box) {
  await page.evaluate((rect) => {
    document.getElementById('__spec-clip')?.remove();
    const clip = document.createElement('div');
    clip.id = '__spec-clip';
    Object.assign(clip.style, {
      position: 'absolute',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      pointerEvents: 'none',
      zIndex: '2147483647',
    });
    document.body.appendChild(clip);
  }, box);
  const image = await page.locator('#__spec-clip').screenshot({ animations: 'disabled' });
  await page.evaluate(() => document.getElementById('__spec-clip')?.remove());
  return image;
}

async function waitForFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function captureSpec(page, state, width, theme, light) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(pathToFileURL(specFile).href);
  if (theme === 'light') await page.addStyleTag({ content: light });
  // The spec's narrow mocks float a toast over their transcript; it isn't a transcript state.
  if (state.startsWith('narrow')) await page.addStyleTag({ content: '.fr .xt{display:none}' });
  await waitForFonts(page);
  const box = await page.evaluate(specBox, state);
  if (!box) throw new Error(`Spec state not found: ${state}`);
  return { image: await shoot(page, box), narrow: box.narrow };
}

async function settle(page) {
  await page.waitForTimeout(250);
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/** Grows a section's body until its transcript no longer scrolls, so nothing is cut. */
async function fitSection(page, state) {
  for (let pass = 0; pass < 4; pass += 1) {
    const grew = await page.evaluate((id) => {
      const section = document.querySelector(`[data-spec-state="${id}"]`);
      const body = section?.querySelector('[data-spec-body]');
      const log = section?.querySelector('[role="log"]');
      if (!body || !log || log.scrollHeight <= log.clientHeight + 1) return false;
      body.style.height = `${log.scrollHeight + 16}px`;
      return true;
    }, state);
    if (!grew) return;
    await settle(page);
  }
}

async function captureImplementation(page, state, width, theme, narrow) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(
    `http://127.0.0.1:${port}/tests/review/transcript-spec.html?theme=${theme}&state=${state}`,
    { waitUntil: 'domcontentloaded' },
  );
  const section = page.locator(`[data-spec-state="${state}"]`);
  const failed = new Promise((_, reject) =>
    page.once('pageerror', (error) => reject(new Error(`[${state}] ${error.message}`))),
  );
  failed.catch(() => undefined);
  await Promise.race([section.locator('[role="log"]').waitFor(), failed]);
  await waitForFonts(page);
  const applied = await page.evaluate(
    () =>
      `${document.documentElement.dataset.theme}:${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}`,
  );
  const expected = `${theme}:${theme}`;
  if (applied !== expected)
    throw new Error(`[${state}] page shows ${applied}, expected ${expected}`);
  if (narrow) {
    await section.evaluate((node, value) => {
      node.style.width = `${Math.round(value)}px`;
      node.style.maxWidth = `${Math.round(value)}px`;
      node.style.marginLeft = '0';
    }, narrow);
  }
  await settle(page);
  // Activity groups start collapsed once their turn is not live; the spec shows them open.
  for (const header of await section
    .locator('button[aria-expanded="false"][aria-label^="Activity:"]')
    .all())
    await header.click();
  await settle(page);
  const expand = (await section.getAttribute('data-spec-expand'))?.split(',') ?? [];
  for (const id of expand) {
    const row = section.locator(`[id="tool-${id}"]`).first();
    const toggle = row.locator('button[aria-label^="Expand"]').first();
    if (await toggle.count()) await toggle.click();
    else console.warn(`[${state}] no expand control for tool ${id}`);
    await settle(page);
  }
  await fitSection(page, state);
  const dialog = await section.getAttribute('data-spec-dialog');
  if (dialog) {
    await section
      .locator(`[id="tool-${dialog}"] button[aria-label^="Technical details for"]`)
      .first()
      .click();
    const frame = page.getByRole('dialog');
    await frame.waitFor();
    await settle(page);
    return frame.screenshot({ animations: 'disabled' });
  }
  const box = await page.evaluate(implementationBox, state);
  if (!box || box.width < 2 || box.height < 2) throw new Error(`Empty implementation: ${state}`);
  const hover = await section.getAttribute('data-spec-hover');
  if (hover) {
    await section.locator(`[id="message-${hover}"]`).hover();
    await settle(page);
  } else await page.mouse.move(0, 0);
  return shoot(page, box);
}

async function compose(page, title, note, spec, implementation, theme) {
  const background = theme === 'light' ? '#f4f2ee' : '#0c0b0a';
  const foreground = theme === 'light' ? '#1d1b18' : '#e8e3d8';
  const html = `<!doctype html><html><head><style>
    body{margin:0;background:${background};color:${foreground};font:13px/1.4 system-ui,sans-serif}
    header{padding:10px 16px;border-bottom:1px solid #8884}
    header b{font-size:14px} header span{opacity:.7;margin-left:12px}
    main{display:flex;gap:16px;align-items:flex-start;padding:16px}
    figure{margin:0;display:flex;flex-direction:column;gap:6px}
    figcaption{font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.06em}
    img{display:block;outline:1px solid #8886}
  </style></head><body><div id="pair" style="display:inline-block">
    <header><b>${title}</b>${note ? `<span>${note}</span>` : ''}</header>
    <main>
      <figure><figcaption>Spec</figcaption><img src="data:image/png;base64,${spec.toString('base64')}"></figure>
      <figure><figcaption>Implementation</figcaption><img src="data:image/png;base64,${implementation.toString('base64')}"></figure>
    </main></div></body></html>`;
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.setContent(html);
  await page.evaluate(() =>
    Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))),
  );
  return page.locator('#pair').screenshot();
}

await mkdir(out, { recursive: true });
const server = await createServer({
  configFile: resolve(web, 'tests/review/transcript-vite.config.ts'),
  root: web,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const errors = [];
const written = [];
try {
  const light = await lightOverride();
  const specPage = await browser.newPage();
  const page = await browser.newPage();
  const composer = await browser.newPage();
  // The first dev-server request optimizes dependencies, which can take minutes.
  page.setDefaultTimeout(180_000);
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[page] ${message.text()}`);
  });
  for (const state of only) {
    const number = String(STATES.indexOf(state) + 1).padStart(2, '0');
    for (const width of widths) {
      for (const theme of themes) {
        const laidOut = specWidth(state, width);
        const spec = await captureSpec(specPage, state, laidOut, theme, light);
        const implementation = await captureImplementation(page, state, width, theme, spec.narrow);
        const title = `${state}, ${width}, ${theme} — spec | implementation`;
        const note = [
          laidOut !== width ? `Spec page laid out at ${laidOut}px; its mocks do not reflow.` : '',
          theme === 'light'
            ? 'The spec is dark-only; its light side is a token-swapped approximation.'
            : '',
        ]
          .filter(Boolean)
          .join(' ');
        const image = await compose(composer, title, note, spec.image, implementation, theme);
        const file = resolve(out, `${number}-${state}--${width}--${theme}.png`);
        await writeFile(file, image);
        written.push(file);
        console.log(file);
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
console.log(`${written.length} comparisons written to ${out}`);
