import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, 'web/src');
const registrySource = readFileSync(
  resolve(sourceRoot, 'lib/presentation-override-registry.ts'),
  'utf8',
);
const registryKinds = new Set(
  [...registrySource.matchAll(/^\s{2}'([^']+)':\s*\{/gmu)].map((match) => match[1]),
);
const callSites = [];

for (const path of sourceFiles(sourceRoot)) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/reportPresentationOverride\(\{([\s\S]*?)\}\);/gu)) {
    const body = match[1];
    const kind = /kind:\s*'([^']+)'/u.exec(body)?.[1];
    if (!kind) {
      callSites.push({ kind: '<dynamic>', path, issueBound: false });
      continue;
    }
    const issueBound = body.includes(
      `PRESENTATION_OVERRIDE_REGISTRY['${kind}'].issue`,
    );
    callSites.push({ kind, path, issueBound });
  }
}

const failures = [];
const callKinds = new Set(callSites.map((site) => site.kind));
for (const kind of registryKinds) {
  if (!callKinds.has(kind)) failures.push(`registry kind has no call site: ${kind}`);
}
for (const site of callSites) {
  const relativePath = site.path.slice(root.length + 1).replaceAll('\\', '/');
  if (!registryKinds.has(site.kind)) failures.push(`${relativePath}: unregistered kind ${site.kind}`);
  if (!site.issueBound) failures.push(`${relativePath}: ${site.kind} does not bind its registry issue`);
}
if (callSites.length > 2) {
  failures.push(`presentation override baseline exceeded: ${callSites.length} call sites (maximum 2)`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`Presentation override ratchet passed (${callSites.length}/2 call sites).`);
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
