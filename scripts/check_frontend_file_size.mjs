import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const limit = 800;
const sourceRoots = [resolve(root, 'web/src'), resolve(root, 'packages/core/src/v3')];
const sourceOwnedRegistryPrefixes = [
  `web${sep}src${sep}components${sep}ai-elements${sep}`,
  `web${sep}src${sep}components${sep}kibo-ui${sep}`,
  `web${sep}src${sep}components${sep}reui${sep}`,
  `web${sep}src${sep}components${sep}theokit${sep}`,
  `web${sep}src${sep}components${sep}ui${sep}`,
];

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const violations = sourceRoots
  .flatMap(filesUnder)
  .filter((path) => /\.tsx?$/u.test(path) && statSync(path).isFile())
  .map((path) => ({
    path,
    relativePath: relative(root, path),
    lines: readFileSync(path, 'utf8').split(/\r?\n/u).length,
  }))
  .filter(
    ({ relativePath, lines }) =>
      lines > limit &&
      !sourceOwnedRegistryPrefixes.some((prefix) => relativePath.startsWith(prefix)),
  );

if (violations.length) {
  for (const violation of violations) {
    console.error(`${violation.relativePath}: ${violation.lines} lines (limit ${limit})`);
  }
  console.error('Split CLIO-owned code by behavior before adding more functionality.');
  process.exitCode = 1;
} else {
  console.log(`CLIO-owned TypeScript file-size ratchet passed (${limit} lines maximum).`);
}
