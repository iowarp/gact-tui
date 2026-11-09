import { describe, expect, it } from 'vitest';
import { exactDataCell, formatDataCell } from './data-cell-format';

describe('formatDataCell', () => {
  it('shows a typed CSV date as its timestamp, not quoted JSON', () => {
    const value = new Date('2026-08-20T08:00:00Z');
    expect(formatDataCell(value, 'time')).toBe('2026-08-20 08:00:00 UTC');
    expect(exactDataCell(value)).toBe('2026-08-20T08:00:00.000Z');
  });

  it('treats an invalid date as an empty cell', () => {
    const value = new Date('not a date');
    expect(formatDataCell(value, 'time')).toBe('Unavailable');
    expect(exactDataCell(value)).toBeUndefined();
  });
});
