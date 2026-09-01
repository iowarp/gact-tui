import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tuiRoot = resolve(root, 'tui');
const forbidden = [
  { label: 'removed startEmulator helper', pattern: /\bstartEmulator\s*\(/u },
  {
    label: 'removed emulator filesystem dependency',
    pattern: /(?:^|["'`\s])(?:\.\.\/|\.\/)?emulator\//mu,
  },
];

function testFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return testFilesUnder(path);
    }
    return entry.name.endsWith('_test.go') ? [path] : [];
  });
}

const violations = testFilesUnder(tuiRoot).flatMap((path) => {
  const source = readFileSync(path, 'utf8');
  return forbidden
    .filter(({ pattern }) => pattern.test(source))
    .map(({ label }) => `${relative(root, path)}: ${label}`);
});

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  console.error('Deprecated TUI tests must not restore the removed emulator compatibility path.');
  process.exitCode = 1;
} else {
  console.log('Deprecated TUI emulator-boundary ratchet passed.');
}
