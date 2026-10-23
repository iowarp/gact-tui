// Fails when a color value appears in web/src outside the theme module.
//
// Every color is a theme token (web/src/theme/contract.ts), defined once per
// theme in web/src/theme/themes.css. Components read tokens: Tailwind
// utilities such as `bg-card`, `var(--token)` in CSS, or `readThemeColor()`
// for canvas, WebGL, Vega and Mermaid. A hex literal, a literal rgb()/hsl()/
// oklch() value or a Tailwind palette utility (`text-amber-600`, `bg-white`)
// skips the theme, so it shows the same color in every theme and the Debug
// theme cannot reveal it.
//
// Scope: web/src .ts/.tsx/.css, excluding web/src/theme (the definitions,
// including the fixed scientific data scales), tests and test fixtures.
// Comments are skipped, so issue references such as #1549 do not count.
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments } from './check_brand_literals.mjs';

const HEX = /(?<![\w&#/])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/giu;
// A literal value, not one built from numbers at runtime (`rgb(${r} ...)`).
const COLOR_FUNCTION = /(?<![a-z-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/giu;
const PALETTE =
  /(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border(?:-[trblxy])?|ring|ring-offset|fill|stroke|from|to|via|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}(?:\/\d+)?(?![\w-])|(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|fill|stroke|from|to|via|outline|shadow|divide)-(?:black|white)(?:\/\d+)?(?![\w-])/gu;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx', '.css'].includes(extname(entry.name)) &&
      !/\.(?:test|spec)\./u.test(entry.name)
      ? [path]
      : [];
  });
}

/** Every color literal in one comment-free line, with what kind it is. */
function colorLiterals(line) {
  return [
    ...[...line.matchAll(HEX)].map((match) => ({ kind: 'hex color', text: match[0] })),
    ...[...line.matchAll(COLOR_FUNCTION)].map((match) => ({
      kind: 'color function',
      text: match[0],
    })),
    ...[...line.matchAll(PALETTE)].map((match) => ({ kind: 'palette utility', text: match[0] })),
  ];
}

function main() {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const sourceRoot = resolve(root, 'web/src');
  const excluded = ['theme', 'test', 'test-fixtures'].map((name) => resolve(sourceRoot, name));
  const failures = [];
  for (const path of sourceFiles(sourceRoot)) {
    if (excluded.some((directory) => path.startsWith(`${directory}/`))) continue;
    const relPath = relative(root, path).replaceAll('\\', '/');
    stripComments(readFileSync(path, 'utf8'))
      .split('\n')
      .forEach((line, index) => {
        for (const literal of colorLiterals(line)) {
          failures.push(
            `${relPath}:${index + 1}: ${literal.kind} ${literal.text} — use a theme token (web/src/theme/contract.ts)`,
          );
        }
      });
  }
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log('Theme color guard passed: no color values outside web/src/theme.');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

export { colorLiterals };
