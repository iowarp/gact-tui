import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GACT_V3_EVENT_TYPES } from './event-types.js';

const VOCABULARY_BLOCK = /```wire-vocabulary-v3\s*\n([\s\S]*?)```/u;
const VOCABULARY_LINE = /^([a-z][a-z0-9_.]*) (implemented|spec-only)$/u;

function readSpecVocabulary(): string[] {
  const spec = readFileSync(new URL('../../../../contract/SPEC.md', import.meta.url), 'utf8');
  const block = VOCABULARY_BLOCK.exec(spec)?.[1];
  if (!block) throw new Error('contract/SPEC.md has no wire-vocabulary-v3 block');

  return block
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const match = VOCABULARY_LINE.exec(line);
      if (!match?.[1]) throw new Error(`Invalid GACT 0.3 vocabulary line: ${line}`);
      return match[1];
    });
}

describe('GACT 0.3 wire vocabulary', () => {
  it('is set-equal to the normative SPEC vocabulary without duplicates', () => {
    const specTypes = readSpecVocabulary();
    expect(new Set(specTypes).size).toBe(specTypes.length);
    expect([...specTypes].sort()).toEqual([...GACT_V3_EVENT_TYPES].sort());
  });
});
