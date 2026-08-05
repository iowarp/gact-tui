/**
 * Machine-checked wire vocabulary gate (iowarp/gact-tui#232, SPEC §7.7).
 *
 * Asserts set-equality between the normative §7.7 event-vocabulary block in
 * contract/SPEC.md and the TypeScript WIRE_EVENT_TYPES canonical array (which
 * is itself compile-time-equal to the GactEvent union via `satisfies` + an
 * AssertNever guard). A type declared in the clients but absent from the spec
 * — or a spec type no client declares — fails here, so declared⇄spec drift
 * cannot reach CI unnoticed. Sibling of wire_shapes.test.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WIRE_EVENT_TYPES } from '../src/wire/events.js';

// One entry per line: `<event.type> <implemented|spec-only>` (SPEC §7.7).
const LINE_RE = /^([a-z][a-z0-9_.]*) (implemented|spec-only)$/;

/** Extract the single fenced block that follows the §7.7 heading. */
function extractVocabularyBlock(spec: string): string {
  const lines = spec.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => /^#+\s.*§7\.7\b/.test(l));
  if (headingIdx < 0) throw new Error('SPEC §7.7 heading not found');
  let open = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (l.startsWith('```')) {
      open = i;
      break;
    }
    if (/^#+\s/.test(l)) break; // hit the next heading before any block
  }
  if (open < 0) throw new Error('SPEC §7.7 fenced block not found');
  let close = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('```')) {
      close = i;
      break;
    }
  }
  if (close < 0) throw new Error('SPEC §7.7 fenced block is not closed');
  return lines.slice(open + 1, close).join('\n');
}

/** Parse the block into the set of event-type names (blank / `#` lines skipped). */
function parseVocabulary(block: string): Set<string> {
  const types = new Set<string>();
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = LINE_RE.exec(line);
    const type = m?.[1];
    if (!type) {
      throw new Error(`§7.7 line does not match the grammar: ${JSON.stringify(raw)}`);
    }
    if (types.has(type)) {
      throw new Error(`§7.7 lists ${type} more than once`);
    }
    types.add(type);
  }
  return types;
}

describe('wire event vocabulary matches SPEC §7.7 (#232)', () => {
  const specPath = new URL('../../../contract/SPEC.md', import.meta.url);
  const spec = readFileSync(specPath, 'utf8');
  const specTypes = parseVocabulary(extractVocabularyBlock(spec));
  const declared = new Set<string>(WIRE_EVENT_TYPES);

  it('§7.7 parses to the expected 75-type set', () => {
    // 75 = 74 + message.part.updated (clean delegation wire, 2026-08-05).
    expect(specTypes.size).toBe(75);
  });

  it('WIRE_EVENT_TYPES has no duplicate entries', () => {
    expect(declared.size).toBe(WIRE_EVENT_TYPES.length);
  });

  it('every declared WIRE_EVENT_TYPES entry is in SPEC §7.7', () => {
    const missingFromSpec = [...declared].filter((t) => !specTypes.has(t)).sort();
    expect(
      missingFromSpec,
      `declared in WIRE_EVENT_TYPES but not in SPEC §7.7: ${missingFromSpec.join(', ')}`,
    ).toEqual([]);
  });

  it('every SPEC §7.7 entry is declared in WIRE_EVENT_TYPES', () => {
    const missingFromDeclared = [...specTypes].filter((t) => !declared.has(t)).sort();
    expect(
      missingFromDeclared,
      `in SPEC §7.7 but not declared in WIRE_EVENT_TYPES: ${missingFromDeclared.join(', ')}`,
    ).toEqual([]);
  });
});
