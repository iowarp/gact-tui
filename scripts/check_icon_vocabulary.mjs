import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

// The interface's action icons come from ONE module, web/src/lib/icon-vocabulary.ts,
// so an action (configure, edit, delete, refresh, ...) has one glyph on every
// screen. This guard fails when CLIO-owned code imports one of those glyphs
// straight from lucide-react instead of by its action name.

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'web/src');
const vocabularyModule = `web${sep}src${sep}lib${sep}icon-vocabulary.ts`;
const registryPrefixes = ['ai-elements', 'kibo-ui', 'mermaidcn', 'reui', 'theokit', 'ui'].map(
  (dir) => `web${sep}src${sep}components${sep}${dir}${sep}`,
);

const vocabularyGlyphs = [
  'Settings',
  'Settings2',
  'Cog',
  'ServerCog',
  'SlidersHorizontal',
  'SlidersVertical',
  'Pencil',
  'SquarePen',
  'Trash',
  'Trash2',
  'X',
  'RefreshCw',
  'RefreshCcw',
  'RotateCw',
  'ListRestart',
  'RotateCcw',
  'Info',
  'CircleHelp',
  'HelpCircle',
  'MoreHorizontal',
  'MoreVertical',
  'Ellipsis',
  'EllipsisVertical',
  'Plus',
  'Save',
];
const forbidden = new Set(vocabularyGlyphs.flatMap((name) => [name, `${name}Icon`]));

/** Glyphs used as a status mark rather than an action (path -> names). */
const allowed = new Map([
  [`web${sep}src${sep}components${sep}clio${sep}deploy-progress.tsx`, new Set(['XIcon'])],
]);

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const failures = [];
for (const path of filesUnder(sourceRoot)) {
  if (!/\.tsx?$/u.test(path) || /\.test\.tsx?$/u.test(path) || !statSync(path).isFile()) continue;
  const rel = relative(root, path);
  if (rel === vocabularyModule || registryPrefixes.some((prefix) => rel.startsWith(prefix)))
    continue;
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'lucide-react'/gu,
  )) {
    for (const raw of match[1].split(',')) {
      const name = raw
        .replace(/^\s*type\s+/u, '')
        .split(/\s+as\s+/u)[0]
        .trim();
      if (name && forbidden.has(name) && !allowed.get(rel)?.has(name)) {
        failures.push(
          `${rel.replaceAll('\\', '/')}: import ${name} from '@/lib/icon-vocabulary' by its action name`,
        );
      }
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(
    'Icon vocabulary guard passed (action icons come from web/src/lib/icon-vocabulary.ts).',
  );
}
