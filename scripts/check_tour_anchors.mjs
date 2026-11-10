import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// The onboarding tour points at real elements through `data-tour` anchors
// (web/src/lib/onboarding/tour-anchors.ts). Lists every anchor the step script
// uses with the source that places it, and fails when one is placed nowhere,
// so an interface change that drops an anchor is caught before the tour falls
// back to a centred card. Tests and fixtures do not count as placements.

const root = resolve(import.meta.dirname, '..');
const webSrc = resolve(root, 'web/src');
const ANCHORS = resolve(webSrc, 'lib/onboarding/tour-anchors.ts');
const STAGE = resolve(webSrc, 'components/clio/onboarding/tour-practice-stage.tsx');
const SCRIPT = resolve(webSrc, 'lib/onboarding/tour-script.ts');
const SOURCE = /\.[jt]sx?$/u;
const EXCLUDED = /(?:\.test\.|\.spec\.|[\\/]test(?:-fixtures)?[\\/])/u;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return SOURCE.test(entry.name) && !EXCLUDED.test(path) ? [path] : [];
  });
}

function declaredAnchors() {
  const text = readFileSync(ANCHORS, 'utf8');
  const list = /TOUR_ANCHORS\s*=\s*\[([^\]]*)\]/u.exec(text)?.[1] ?? '';
  return [...list.matchAll(/'([a-z][a-z-]*)'/gu)].map((match) => match[1]);
}

/** Anchors the step script points at, plus the ones the tour's own code follows. */
function scriptAnchors() {
  const text = readFileSync(SCRIPT, 'utf8');
  const stage = readFileSync(STAGE, 'utf8');
  return [
    ...new Set([
      ...[...text.matchAll(/anchor:\s*'([a-z][a-z-]*)'/gu)].map((match) => match[1]),
      ...[...stage.matchAll(/findTourAnchor\(\s*'([a-z][a-z-]*)'/gu)].map((match) => match[1]),
    ]),
  ];
}

const declared = declaredAnchors();
const used = scriptAnchors();
const placements = new Map(used.map((id) => [id, []]));
const PLACEMENT = [/tourAnchor\(\s*'([a-z][a-z-]*)'\s*\)/gu, /data-tour="([a-z][a-z-\s]*)"/gu];

for (const file of sources(webSrc)) {
  if (file === ANCHORS) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const pattern of PLACEMENT) {
      for (const match of line.matchAll(pattern)) {
        for (const id of match[1].split(/\s+/u)) {
          placements.get(id)?.push(`${relative(root, file)}:${index + 1}`);
        }
      }
    }
  });
}

const problems = [];
for (const id of used) {
  if (!declared.includes(id))
    problems.push(`"${id}" is used by tour-script.ts but missing from TOUR_ANCHORS`);
}
console.log('Onboarding tour anchors:');
for (const [id, where] of placements) {
  console.log(`  ${id.padEnd(22)} ${where.length ? where.join(', ') : 'NOT PLACED'}`);
  if (!where.length) problems.push(`"${id}" is used by tour-script.ts but no element carries it`);
}
if (problems.length) {
  console.error(`\nTour anchor check failed:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  console.error(
    'Place the anchor on the element the step describes with {...tourAnchor(id)}, or update the step in web/src/lib/onboarding/tour-script.ts.',
  );
  process.exit(1);
}
