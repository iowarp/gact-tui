import type { ThemedToken } from 'shiki';
import { describe, expect, it } from 'vitest';
import { indentColumns, splitIndent } from './source-indent';

const token = (content: string, offset: number): ThemedToken => ({ content, offset });

describe('splitIndent', () => {
  it('splits the indent from a line, whether Shiki gives it its own token or not', () => {
    const own = splitIndent([token('    ', 0), token('with', 4), token(' open', 8)]);
    expect(own).toMatchObject({ lead: '    ', columns: 4 });
    expect(own.rest.map((t) => t.content)).toEqual(['with', ' open']);

    const merged = splitIndent([token('        return', 0), token(' x', 14)]);
    expect(merged).toMatchObject({ lead: '        ', columns: 8 });
    expect(merged.rest).toEqual([token('return', 8), token(' x', 14)]);
  });

  it('leaves unindented and whitespace-only lines whole', () => {
    expect(splitIndent([token('def', 0)])).toMatchObject({ lead: '', columns: 0 });
    expect(splitIndent([token('   ', 0)])).toMatchObject({
      lead: '',
      columns: 0,
      rest: [token('   ', 0)],
    });
  });

  it('counts a tab to the next tab stop', () => {
    expect(indentColumns('\t')).toBe(8);
    expect(indentColumns('  \t  ')).toBe(10);
  });
});
