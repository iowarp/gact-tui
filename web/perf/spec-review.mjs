// Side-by-side review of the app against the visual-language spec.
//
//   node perf/spec-review.mjs spec  [--out DIR]
//       Crop every block of docs/design/visual-language/*.html into
//       DIR/_spec/<page>/<nn>-<slug>.png and DIR/_spec/index.json.
//   node perf/spec-review.mjs pair  --screens DIR [--out DIR] [--only s1,s5]
//       Pair each spec crop with the matching app captures from `pnpm screens`
//       (see perf/spec-review-map.mjs): spec left, app right, one image per
//       theme and width in DIR/<surface>/, plus DIR/<surface>/index.md.
//   node perf/spec-review.mjs cross --screens DIR [--out DIR]
//       From `pnpm screens --probes` data, write DIR/cross-surface.md: type
//       scale, one-line controls that wrapped, Mac/Windows key glyphs,
//       light-theme contrast and status-word looks.
//
// Full review of a branch (after `pnpm build`):
//   pnpm screens --widths 1680,1280,1024,768 --themes dark,light --probes \
//     --concurrency 3 --out DIR/_app
//   pnpm spec-review spec --out DIR
//   pnpm spec-review pair --screens DIR/_app --out DIR
//   pnpm spec-review cross --screens DIR/_app --out DIR
//
// `pnpm screens --out DIR/_app` produces the app side. Measurements of the
// spec (font, padding, colour tokens) stay in the HTML; the crops only show
// where to look.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { surfaces } from './spec-review-map.mjs';
import { webRoot } from './stack.mjs';

const args = process.argv.slice(2);
const mode = args[0];
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};
const outDir = resolve(webRoot, option('out', 'test-results/spec-review'));
const specDir = resolve(webRoot, '..', 'docs', 'design', 'visual-language');
const only = option('only', '').split(',').filter(Boolean);

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 48) || 'block';

// --- Spec crops -----------------------------------------------------------------

async function cropSpec() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
  const index = [];
  for (const file of readdirSync(specDir).filter((name) => name.endsWith('.html'))) {
    const name = file.replace(/\.html$/u, '');
    await page.goto(pathToFileURL(join(specDir, file)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    // Top-level blocks; full-picture nests its sections in .wrap and splits
    // very tall sections into their figures.
    const blocks = await page.evaluate(() => {
      const visible = (element) => element.getBoundingClientRect().height > 40;
      let roots = [...document.body.children].filter(visible);
      if (roots.length === 1 && roots[0].children.length > 3) roots = [...roots[0].children];
      const result = [];
      const add = (element, heading) => {
        const caption =
          element.querySelector('h2,h3,.cap,.xcap,figcaption')?.textContent ??
          element.textContent ??
          '';
        element.setAttribute('data-spec-block', String(result.length));
        result.push({
          title: `${heading ? `${heading} / ` : ''}${caption.trim().replace(/\s+/gu, ' ').slice(0, 70)}`,
          text: (element.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, 400),
        });
      };
      for (const element of roots.filter(visible)) {
        if (element.tagName === 'H1' || element.matches('p.lede')) continue;
        const height = element.getBoundingClientRect().height;
        if (height > 2600) {
          const heading = element.querySelector('h2')?.textContent?.trim() ?? '';
          for (const child of [...element.children].filter(visible)) add(child, heading);
        } else add(element, '');
      }
      return result;
    });
    mkdirSync(join(outDir, '_spec', name), { recursive: true });
    for (const [i, block] of blocks.entries()) {
      const id = `${String(i + 1).padStart(2, '0')}-${slug(block.title)}`;
      const path = join(outDir, '_spec', name, `${id}.png`);
      const locator = page.locator(`[data-spec-block="${i}"]`);
      await locator.screenshot({ path, animations: 'disabled' }).catch(() => undefined);
      if (!existsSync(path)) continue;
      const box = await locator.boundingBox();
      index.push({
        page: name,
        id,
        file: relative(outDir, path).replaceAll('\\', '/'),
        title: block.title,
        text: block.text,
        width: Math.round(box?.width ?? 0),
        height: Math.round(box?.height ?? 0),
      });
    }
    console.log(`[spec] ${name}: ${blocks.length} blocks`);
  }
  writeFileSync(join(outDir, '_spec', 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  const lines = ['# Spec blocks', '', '| Page | Block | Title |', '|---|---|---|'];
  for (const block of index)
    lines.push(
      `| ${block.page} | [${block.id}](${block.file}) | ${block.title.replaceAll('|', '/')} |`,
    );
  writeFileSync(join(outDir, '_spec', 'index.md'), `${lines.join('\n')}\n`);
  await browser.close();
}

// --- Pairs ------------------------------------------------------------------------

function pairHtml({ specs, app, label }) {
  const img = (path) => pathToFileURL(path).href;
  return `<!doctype html><html><head><style>
    body{margin:0;background:#888;font:600 15px system-ui;color:#111;display:flex;gap:16px;padding:12px;align-items:flex-start;width:max-content}
    .col{display:flex;flex-direction:column;gap:10px;background:#ddd;padding:8px;border-radius:6px}
    .col h1{font:700 16px system-ui;margin:0}
    .col h2{font:500 12px ui-monospace,monospace;margin:4px 0 0}
    img{display:block;max-width:none;outline:1px solid #555}
  </style></head><body>
  <div class="col"><h1>SPEC</h1>${specs
    .map((spec) => `<h2>${spec.page} / ${spec.id}</h2><img src="${img(spec.path)}">`)
    .join('')}</div>
  <div class="col"><h1>APP · ${label}</h1><img src="${img(app)}"></div>
  </body></html>`;
}

async function pair() {
  const screensDir = resolve(webRoot, option('screens', join(outDir, '_app')));
  const manifest = JSON.parse(readFileSync(join(screensDir, 'screens-manifest.json'), 'utf8'));
  const specIndex = JSON.parse(readFileSync(join(outDir, '_spec', 'index.json'), 'utf8'));
  const findSpecs = (patterns) =>
    patterns.flatMap((pattern) => {
      const [pageName, match] = pattern.split(':');
      const re = new RegExp(match ?? '.', 'iu');
      return specIndex
        .filter((block) => block.page === pageName && (re.test(block.id) || re.test(block.title)))
        .map((block) => ({ ...block, path: join(outDir, block.file) }));
    });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  for (const surface of surfaces.filter((item) => !only.length || only.includes(item.id))) {
    const dir = join(outDir, surface.id);
    mkdirSync(dir, { recursive: true });
    const lines = [
      `# ${surface.title} (${surface.owner})`,
      '',
      'Spec on the left, app on the right.',
      '',
      '| App state | Spec blocks | Captures |',
      '|---|---|---|',
    ];
    for (const item of surface.pairs) {
      const specs = findSpecs(item.spec).slice(0, item.maxSpecs ?? 3);
      const pattern = new RegExp(`^(?:${item.app})$`, 'u');
      const matches = manifest.shots.filter((shot) =>
        pattern.test(`${shot.surface}--${shot.state}`),
      );
      const states = [...new Set(matches.map((shot) => `${shot.surface}--${shot.state}`))];
      if (!states.length) {
        lines.push(
          `| ${item.app} | ${specs.map((spec) => `${spec.page}/${spec.id}`).join('<br>')} | not in catalogue |`,
        );
      }
      for (const state of states) {
        const written = [];
        const failed = [];
        for (const shot of matches.filter((s) => `${s.surface}--${s.state}` === state)) {
          if (!shot.ok) {
            failed.push(`${shot.theme} ${shot.width}: ${shot.reason?.slice(0, 80)}`);
            continue;
          }
          const app = join(screensDir, shot.file);
          const label = `${state} · ${shot.theme} · ${shot.width}`;
          const html = join(dir, '_pair.html');
          writeFileSync(html, pairHtml({ specs, app, label }));
          await page.goto(pathToFileURL(html).href);
          await page.evaluate(() =>
            Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))),
          );
          const name = `${state}--${shot.theme}-${shot.width}.png`;
          await page.screenshot({ path: join(dir, name), fullPage: true });
          written.push(`[${shot.theme} ${shot.width}](${name})`);
        }
        lines.push(
          `| ${state} | ${specs.map((spec) => `${spec.page}/${spec.id}`).join('<br>') || '(none)'} | ${[...written, ...failed.map((f) => `failed ${f.replaceAll('|', '/')}`)].join(' ') || 'not captured'} |`,
        );
      }
    }
    writeFileSync(join(dir, 'index.md'), `${lines.join('\n')}\n`);
    rmSync(join(dir, '_pair.html'), { force: true });
    console.log(`[pair] ${surface.id}: ${surface.pairs.length} states`);
  }
  await browser.close();
}

// --- Cross-surface consistency -------------------------------------------------------

function cross() {
  const screensDir = resolve(webRoot, option('screens', join(outDir, '_app')));
  const manifest = JSON.parse(readFileSync(join(screensDir, 'screens-manifest.json'), 'utf8'));
  const shots = manifest.shots.filter((shot) => shot.ok && shot.probe);
  const id = (shot) => `${shot.surface}--${shot.state}`;
  const lines = [
    '# Cross-surface consistency',
    '',
    `Commit \`${manifest.commit}\`; ${shots.length} probed captures.`,
    '',
  ];

  // Type scale: sizes in use at 1680 dark, and which states use the most.
  const wide = shots.filter((shot) => shot.theme === 'dark' && shot.width === 1680);
  const scale = new Map();
  for (const shot of wide)
    for (const entry of shot.probe.typeScale) {
      const row = scale.get(entry.size) ?? { count: 0, states: new Set(), sample: entry.sample };
      row.count += entry.count;
      row.states.add(id(shot));
      scale.set(entry.size, row);
    }
  lines.push(
    '## Type scale (1680, dark)',
    '',
    'Every font-size/weight pair carrying visible text, by element count.',
    '',
    '| Size/weight | Elements | States | Sample |',
    '|---|---|---|---|',
  );
  for (const [size, row] of [...scale.entries()].sort((a, b) => b[1].count - a[1].count))
    lines.push(
      `| ${size} | ${row.count} | ${row.states.size} | ${row.sample.replaceAll('|', '/')} |`,
    );
  lines.push(
    '',
    '### States with the most distinct sizes',
    '',
    '| State | Distinct size/weight pairs | Sizes |',
    '|---|---|---|',
  );
  for (const shot of [...wide]
    .sort((a, b) => b.probe.typeScale.length - a.probe.typeScale.length)
    .slice(0, 20))
    lines.push(
      `| ${id(shot)} | ${shot.probe.typeScale.length} | ${[
        ...new Set(shot.probe.typeScale.map((entry) => entry.size.split('/')[0])),
      ]
        .sort((a, b) => parseFloat(a) - parseFloat(b))
        .join(' ')} |`,
    );

  // Wrapped one-line controls.
  lines.push(
    '',
    '## One-line controls that wrapped',
    '',
    '| Width | State | Element | Text | Lines |',
    '|---|---|---|---|---|',
  );
  const seenWrap = new Set();
  for (const shot of [...shots].sort((a, b) => a.width - b.width))
    for (const wrap of shot.probe.wrapped) {
      const key = `${shot.width}|${wrap.text}`;
      if (shot.theme !== 'dark' || seenWrap.has(key)) continue;
      seenWrap.add(key);
      lines.push(
        `| ${shot.width} | ${id(shot)} | \`${wrap.what.replaceAll('|', '/')}\` | ${wrap.text.replaceAll('|', '/')} | ${wrap.lines} |`,
      );
    }

  // Key glyphs.
  lines.push(
    '',
    '## Key glyphs',
    '',
    'Mac captures (`mac-*`) must show ⌘/⌥/⇧ and no "Ctrl"; Windows captures no ⌘.',
    '',
    '| State | Theme | Width | ⌘⌥⇧ texts | Ctrl texts | Alt texts | Verdict |',
    '|---|---|---|---|---|---|---|',
  );
  for (const shot of shots.filter((s) => s.width === 1280 && s.theme === 'dark')) {
    const { cmd, ctrl, alt } = shot.probe.glyphs;
    const mac = shot.state.startsWith('mac-');
    const bad = mac ? ctrl > 0 || alt > 0 : cmd > 0;
    if (!mac && !bad && !shot.surface.startsWith('keyboard')) continue;
    lines.push(
      `| ${id(shot)} | ${shot.theme} | ${shot.width} | ${cmd} | ${ctrl} | ${alt} | ${bad ? '**wrong platform keys**' : 'ok'} |`,
    );
  }

  // Light contrast.
  lines.push(
    '',
    '## Light-theme contrast below WCAG AA',
    '',
    'Text under 4.5:1 (3:1 for large text) against its painted background, at 1280.',
    '',
    '| Contrast | Text | Element | Colour | Size | States |',
    '|---|---|---|---|---|---|',
  );
  const contrast = new Map();
  for (const shot of shots.filter((s) => s.theme === 'light' && s.width === 1280))
    for (const item of shot.probe.lowContrast) {
      const key = `${item.text}|${item.color}`;
      const row = contrast.get(key) ?? { ...item, states: new Set() };
      row.states.add(id(shot));
      contrast.set(key, row);
    }
  for (const row of [...contrast.values()].sort((a, b) => a.contrast - b.contrast).slice(0, 60))
    lines.push(
      `| ${row.contrast} | ${row.text.replaceAll('|', '/')} | \`${row.what.replaceAll('|', '/')}\` | ${row.color} | ${row.fontSize} | ${[...row.states].slice(0, 4).join(', ')}${row.states.size > 4 ? ` +${row.states.size - 4}` : ''} |`,
    );

  // Status words.
  lines.push(
    '',
    '## Status words',
    '',
    'Each distinct look (size, weight, colour, background, case) a status word is drawn with, at 1680 dark.',
    '',
    '| Word | Looks | Look (count) |',
    '|---|---|---|',
  );
  const words = new Map();
  for (const shot of wide)
    for (const [word, looks] of Object.entries(shot.probe.status)) {
      const bucket = words.get(word) ?? new Map();
      for (const [look, count] of Object.entries(looks)) {
        const row = bucket.get(look) ?? { count: 0, states: new Set() };
        row.count += count;
        row.states.add(id(shot));
        bucket.set(look, row);
      }
      words.set(word, bucket);
    }
  for (const [word, bucket] of [...words.entries()].sort((a, b) => b[1].size - a[1].size))
    lines.push(
      `| ${word} | ${bucket.size} | ${[...bucket.entries()]
        .map(([look, row]) => `${look} (${row.count}; ${[...row.states].slice(0, 2).join(', ')})`)
        .join('<br>')
        .replaceAll('|', '/')} |`,
    );

  writeFileSync(join(outDir, 'cross-surface.md'), `${lines.join('\n')}\n`);
  console.log(`[cross] ${join(outDir, 'cross-surface.md')}`);
}

if (mode === 'spec') await cropSpec();
else if (mode === 'pair') await pair();
else if (mode === 'cross') cross();
else {
  console.error('usage: node perf/spec-review.mjs spec|pair|cross [--out DIR] [--screens DIR]');
  process.exit(2);
}
