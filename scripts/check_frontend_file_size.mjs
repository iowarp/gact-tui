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
  console.error(
    [
      '',
      `A file over ${limit} lines is a design signal, not a formatting problem.`,
      'It means the module has taken on more than one responsibility and needs to be',
      're-architected before it grows further. Do not bring the count under the limit by',
      'joining lines, removing blank lines or comments, packing props into a spread',
      'object, moving code into an unrelated file, or raising or exempting the limit.',
      'Those bypasses keep the problem and hide the signal.',
      '',
      'Instead:',
      '  1. List what the file is responsible for (data loading, side effects, layout,',
      '     each distinct piece of UI or behaviour).',
      '  2. Move each responsibility into its own component, hook or module with a',
      '     narrow interface, so a change to one part no longer edits this file.',
      '  3. Make that split its own commit with no behaviour change, then add the',
      '     new functionality to the module that owns it.',
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(`CLIO-owned TypeScript file-size ratchet passed (${limit} lines maximum).`);
}
