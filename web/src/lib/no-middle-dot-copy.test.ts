import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Product rule: the UI never shows a middle dot "·" (U+00B7). Separate metadata with
 * commas, parentheses, a colon or layout gaps instead. This guard scans the shipped
 * sources of `web/src` and `packages/core/src` (tests and fixtures excluded) and lists
 * every file:line that writes the character. Comment lines may name it.
 */
const WEB = process.cwd();
const ROOTS = [resolve(WEB, 'src'), resolve(WEB, '../packages/core/src')];
const SOURCE = /\.(?:[cm]?[jt]sx?|css|html)$/u;
const EXCLUDED = /(?:\.test\.|\.spec\.|[\\/]__tests__[\\/]|[\\/]src[\\/]test(?:-fixtures)?[\\/])/u;
const MIDDLE_DOT = '\u00b7';
const ESCAPED = /\\u00b7|\\u\{0*b7\}|\\xb7|&middot;|&#0*183;|&#x0*b7;/iu;
const COMMENT = /^\s*(?:\/\/|\/\*|\*|\{\s*\/\*)/u;

/**
 * Files that may spell the character as an escape because they read text produced
 * elsewhere and remove the dot before it is shown. Never add UI copy here.
 */
const PARSES_INCOMING_TEXT: Record<string, string> = {
  'web/src/components/clio/composer-references.tsx':
    'server reference details are joined with the dot; the UI rewrites the separator',
  'web/src/components/clio/markdown-source-group.tsx':
    'model-written markdown may separate source links with the dot; they are regrouped',
  'web/src/components/clio/storage-tool-presentation.ts':
    'agent tool summaries use the dot; the UI rewrites it to a comma',
  'web/src/components/clio/workbench.tsx':
    'workbench tabs saved by older builds end in a dotted suffix that is stripped on load',
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return SOURCE.test(entry.name) && !EXCLUDED.test(path) ? [path] : [];
  });
}

function repoPath(path: string): string {
  return relative(resolve(WEB, '..'), path).split('\\').join('/');
}

const files = ROOTS.flatMap(sources);

describe('UI copy has no middle dot', () => {
  it('scans the shipped web and core sources', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never writes the middle dot outside comments', () => {
    const offenders = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          line.includes(MIDDLE_DOT) && !COMMENT.test(line)
            ? [`${repoPath(path)}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );
    expect(offenders, 'Replace "·" with commas, parentheses, a colon or layout gaps').toEqual([]);
  });

  it('spells the middle dot as an escape only where incoming text is parsed', () => {
    const escaped = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          ESCAPED.test(line) && !COMMENT.test(line)
            ? [{ file: repoPath(path), at: `${repoPath(path)}:${index + 1}: ${line.trim()}` }]
            : [],
        ),
    );
    expect(
      escaped.filter(({ file }) => !(file in PARSES_INCOMING_TEXT)).map(({ at }) => at),
    ).toEqual([]);
    expect(
      Object.keys(PARSES_INCOMING_TEXT).filter(
        (file) => !escaped.some((entry) => entry.file === file),
      ),
      'Remove allowlist entries that no longer parse the middle dot',
    ).toEqual([]);
  });
});
