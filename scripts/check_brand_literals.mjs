// Fails when a hardcoded 'CLIO' literal appears in web/src outside the
// brand-vocabulary module, tests, and an explicit, justified allowlist.
//
// Product/agent identity must come from `@/lib/brand-vocabulary` (vocab.*),
// itself derived from the selected brand.json — never a bare string (see
// CLAUDE.md's "Product name, landing copy, logo, and domain terminology
// come from the selected embedding-agent brand" rule). This is the
// enforcement half of that rule: any NEW occurrence must either be
// converted to vocab.product / vocab.agent, or added to
// scripts/brand_literals_allowlist.json with a one-line reason (e.g. a
// distinct companion-service brand name like "CLIO Relay" that has no
// vocab field yet).
//
// Scope: only real string/JSX-text content is checked — comment lines
// (// ..., and /* ... */ / JSDoc blocks) are skipped, since they are not
// user-facing and this check is about rendered copy, not documentation.
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const sourceRoot = resolve(root, 'web/src');
const allowlistPath = resolve(root, 'scripts/brand_literals_allowlist.json');
const vocabPath = resolve(sourceRoot, 'lib/brand-vocabulary.ts');

const CLIO_WORD = /\bCLIO\b/u;

/** @type {Array<{ file: string; match: string; reason: string }>} */
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
for (const entry of allowlist) {
  if (!entry.file || !entry.match || !entry.reason?.trim()) {
    console.error(
      `check_brand_literals: allowlist entries need file, match, and a one-line reason — got ${JSON.stringify(entry)}`,
    );
    process.exitCode = 1;
  }
}

/** Strip `// ...` line comments and `/* ... *\/` (incl. JSDoc) block comments. */
function stripComments(source) {
  let inBlock = false;
  return source
    .split('\n')
    .map((line) => {
      let text = line;
      if (inBlock) {
        const end = text.indexOf('*/');
        if (end === -1) return '';
        text = text.slice(end + 2);
        inBlock = false;
      }
      const blockStart = text.indexOf('/*');
      const lineStart = text.indexOf('//');
      if (blockStart !== -1 && (lineStart === -1 || blockStart < lineStart)) {
        const end = text.indexOf('*/', blockStart + 2);
        if (end === -1) {
          inBlock = true;
          text = text.slice(0, blockStart);
        } else {
          text = text.slice(0, blockStart) + text.slice(end + 2);
        }
      } else if (lineStart !== -1) {
        text = text.slice(0, lineStart);
      }
      return text;
    })
    .join('\n');
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) && !/\.(?:test|spec)\./u.test(entry.name)
      ? [path]
      : [];
  });
}

const failures = [];
const usedAllowlistEntries = new Set();

for (const path of sourceFiles(sourceRoot)) {
  if (path === vocabPath) continue;
  const relPath = relative(root, path).replaceAll('\\', '/');
  const content = stripComments(readFileSync(path, 'utf8'));
  const fileAllowlist = allowlist.filter((entry) => entry.file === relPath);

  content.split('\n').forEach((line, index) => {
    if (!CLIO_WORD.test(line)) return;
    const allowed = fileAllowlist.find((entry) => line.includes(entry.match));
    if (allowed) {
      usedAllowlistEntries.add(allowed);
      return;
    }
    failures.push(
      `${relPath}:${index + 1}: hardcoded 'CLIO' literal — use vocab.product/vocab.agent ` +
        `from @/lib/brand-vocabulary, or add a justified entry to scripts/brand_literals_allowlist.json`,
    );
  });
}

for (const entry of allowlist) {
  if (!usedAllowlistEntries.has(entry)) {
    failures.push(
      `scripts/brand_literals_allowlist.json: stale entry for ${entry.file} (match ${JSON.stringify(entry.match)}) — no longer found, remove it`,
    );
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(
    `Brand literal guard passed (${allowlist.length} allowlisted phrase${allowlist.length === 1 ? '' : 's'}).`,
  );
}
