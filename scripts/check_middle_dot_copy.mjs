import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Product rule: the UI never shows a middle dot (U+00B7). Separate metadata with
// commas, parentheses, a colon or layout gaps instead. Scans the shipped sources
// of web/src and packages/core/src (tests and fixtures excluded) and lists every
// file:line that writes the character. Comment lines may name it.

const root = resolve(import.meta.dirname, '..');
const roots = [resolve(root, 'web/src'), resolve(root, 'packages/core/src')];
const SOURCE = /\.(?:[cm]?[jt]sx?|css|html)$/u;
const EXCLUDED = /(?:\.test\.|\.spec\.|[\\/]__tests__[\\/]|[\\/]src[\\/]test(?:-fixtures)?[\\/])/u;
const MIDDLE_DOT = '\u00b7';
const ESCAPED = /\\u00b7|\\u\{0*b7\}|\\xb7|&middot;|&#0*183;|&#x0*b7;/iu;
const COMMENT = /^\s*(?:\/\/|\/\*|\*|\{\s*\/\*)/u;

// Files that may spell the character as an escape because they read text
// produced elsewhere and remove the dot before it is shown. Never add UI copy here.
const PARSES_INCOMING_TEXT = {
  'web/src/components/clio/composer-references.tsx':
    'server reference details are joined with the dot; the UI rewrites the separator',
  'web/src/components/clio/markdown-source-group.tsx':
    'model-written markdown may separate source links with the dot; they are regrouped',
  'web/src/components/clio/storage-tool-presentation.ts':
    'agent tool summaries use the dot; the UI rewrites it to a comma',
  'web/src/components/clio/workbench-tab-storage.ts':
    'workbench tabs saved by older builds end in a dotted suffix that is stripped on load',
};

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return SOURCE.test(entry.name) && !EXCLUDED.test(path) ? [path] : [];
  });
}

const files = roots.flatMap(sources);
const failures = [];
if (files.length <= 100)
  failures.push(`Expected to scan over 100 source files, found ${files.length}.`);

const escapedFiles = new Set();
for (const path of files) {
  const file = relative(root, path).split('\\').join('/');
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (COMMENT.test(line)) return;
      const at = `${file}:${index + 1}: ${line.trim()}`;
      if (line.includes(MIDDLE_DOT)) {
        failures.push(
          `${at}\n  Replace the middle dot with commas, parentheses, a colon or layout gaps.`,
        );
      }
      if (ESCAPED.test(line)) {
        escapedFiles.add(file);
        if (!(file in PARSES_INCOMING_TEXT)) {
          failures.push(`${at}\n  Escaped middle dot outside a file that parses incoming text.`);
        }
      }
    });
}
for (const file of Object.keys(PARSES_INCOMING_TEXT)) {
  if (!escapedFiles.has(file)) {
    failures.push(
      `${file}\n  No longer parses the middle dot; remove it from PARSES_INCOMING_TEXT.`,
    );
  }
}

if (failures.length) {
  console.error(`Middle-dot copy check failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Middle-dot copy check passed for ${files.length} source files.`);
