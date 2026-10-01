import { describe, expect, it } from 'vitest';
import { applyClientFilters } from './data-query-filters';
import type { ClioColumnFilterValue } from './data-table-column-filter';

/**
 * G0 point 5: "inline rows filter client-side, dataUri views on the server."
 * `applyClientFilters` is the inline counterpart of the server's own
 * `_filter_mask` (`table_query.py`) — same `contains` (case-insensitive
 * substring) and `range` (inclusive both ends) semantics, so a reader sees
 * the identical behaviour regardless of which path ran.
 */

const ROWS = [
  { category: 'Alpha', value: 1 },
  { category: 'beta', value: 5 },
  { category: 'Gamma', value: 10 },
];

function filters(entries: Array<[string, ClioColumnFilterValue]>): Map<string, ClioColumnFilterValue> {
  return new Map(entries);
}

describe('applyClientFilters', () => {
  it('returns every row, as a new array, when no filters are active', () => {
    const result = applyClientFilters(ROWS, filters([]));
    expect(result).toEqual(ROWS);
    expect(result).not.toBe(ROWS);
  });

  it('applies a text "contains" filter case-insensitively', () => {
    const result = applyClientFilters(ROWS, filters([['category', { contains: 'a', kind: 'text' }]]));
    expect(result.map((row) => row.category)).toEqual(['Alpha', 'beta', 'Gamma']);

    const narrower = applyClientFilters(
      ROWS,
      filters([['category', { contains: 'gam', kind: 'text' }]]),
    );
    expect(narrower.map((row) => row.category)).toEqual(['Gamma']);
  });

  it('skips an empty "contains" value instead of matching nothing', () => {
    const result = applyClientFilters(ROWS, filters([['category', { contains: '', kind: 'text' }]]));
    expect(result).toHaveLength(3);
  });

  it('applies an inclusive numeric range filter on both ends', () => {
    const result = applyClientFilters(ROWS, filters([['value', { kind: 'range', max: 5, min: 2 }]]));
    expect(result.map((row) => row.value)).toEqual([5]);

    const boundaryInclusive = applyClientFilters(
      ROWS,
      filters([['value', { kind: 'range', max: 10, min: 1 }]]),
    );
    expect(boundaryInclusive).toHaveLength(3);
  });

  it('drops a row whose column is not numeric when a range filter applies', () => {
    const rows = [{ value: 'not-a-number' }, { value: 5 }];
    const result = applyClientFilters(rows, filters([['value', { kind: 'range', min: 0 }]]));
    expect(result).toEqual([{ value: 5 }]);
  });

  it('ANDs multiple column filters together', () => {
    const result = applyClientFilters(
      ROWS,
      filters([
        ['category', { contains: 'a', kind: 'text' }],
        ['value', { kind: 'range', min: 5 }],
      ]),
    );
    expect(result.map((row) => row.category)).toEqual(['beta', 'Gamma']);
  });
});
