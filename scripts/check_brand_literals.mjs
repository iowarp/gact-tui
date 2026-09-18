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
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLIO_WORD_GLOBAL = /\bCLIO\b/gu;

/**
 * Index of a `//` line-comment start, or -1. A `//` only starts a comment at
 * the beginning of the line or right after whitespace — `https://example.com`
 * has a `//` immediately after `:`, so it is left alone and the rest of that
 * line (which may legitimately contain 'CLIO') still gets scanned.
 */
function lineCommentIndex(text) {
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] !== '/' || text[index + 1] !== '/') continue;
    if (index === 0 || /\s/u.test(text[index - 1])) return index;
  }
  return -1;
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
      const lineStart = lineCommentIndex(text);
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

/** Every `\bCLIO\b` match position in a line. */
function clioOccurrences(line) {
  return [...line.matchAll(CLIO_WORD_GLOBAL)].map((match) => match.index ?? 0);
}

/** [start, end) spans covered by each allowlist entry's literal match text, repeated matches included. */
function allowlistSpans(line, entries) {
  const spans = [];
  for (const entry of entries) {
    let fromIndex = 0;
    for (;;) {
      const start = line.indexOf(entry.match, fromIndex);
      if (start === -1) break;
      spans.push({ start, end: start + entry.match.length, entry });
      fromIndex = start + entry.match.length;
    }
  }
  return spans;
}

function main() {
  // Resolved lazily, only when actually scanning the tree — never at module
  // top level, so importing this file's pure helpers (e.g. from unit tests)
  // never depends on `import.meta.url` being a real `file:` URL, which does
  // not hold under every module loader (e.g. Vitest's).
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const sourceRoot = resolve(root, 'web/src');
  const allowlistPath = resolve(root, 'scripts/brand_literals_allowlist.json');
  const vocabPath = resolve(sourceRoot, 'lib/brand-vocabulary.ts');

  /** @type {Array<{ file: string; match: string; reason: string }>} */
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  const failures = [];
  const usedAllowlistEntries = new Set();

  for (const entry of allowlist) {
    if (!entry.file || !entry.match || !entry.reason?.trim()) {
      failures.push(
        `check_brand_literals: allowlist entries need file, match, and a one-line reason — got ${JSON.stringify(entry)}`,
      );
    }
  }

  for (const path of sourceFiles(sourceRoot)) {
    if (path === vocabPath) continue;
    const relPath = relative(root, path).replaceAll('\\', '/');
    const content = stripComments(readFileSync(path, 'utf8'));
    const fileAllowlist = allowlist.filter((entry) => entry.file === relPath);

    content.split('\n').forEach((line, index) => {
      const occurrences = clioOccurrences(line);
      if (!occurrences.length) return;
      // Every occurrence of 'CLIO' on the line must fall inside an allowlisted
      // phrase's span — one allowlisted phrase (e.g. "CLIO Relay") never
      // excuses a SEPARATE, uncovered 'CLIO' elsewhere on the same line (e.g.
      // "CLIO Relay connects CLIO to the workspace." still fails on the bare
      // second occurrence).
      const spans = allowlistSpans(line, fileAllowlist);
      const uncovered = occurrences.filter(
        (position) => !spans.some((span) => position >= span.start && position < span.end),
      );
      spans.forEach((span) => usedAllowlistEntries.add(span.entry));
      if (!uncovered.length) return;
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
}

// Only scan the real tree when this file is run directly (`node
// scripts/check_brand_literals.mjs`) — an import (e.g. from the unit tests
// exercising the pure helpers below) must never scan the filesystem or set
// process.exitCode as a side effect.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

export { allowlistSpans, clioOccurrences, lineCommentIndex, stripComments };
