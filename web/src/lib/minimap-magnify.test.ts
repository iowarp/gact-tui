import { describe, expect, it } from 'vitest';
import { magnifyRows } from './minimap-magnify';

const starts = Array.from({ length: 20 }, (_, index) => index * 11);

describe('magnifyRows', () => {
  it('leaves the rail untouched with no pointer', () => {
    expect(magnifyRows(starts, 11, null)).toEqual(starts.map((y) => ({ y, height: 11, lift: 0 })));
  });

  it('lifts rows near the pointer most and far rows barely', () => {
    const rows = magnifyRows(starts, 11, 10 * 11 + 5.5);
    expect(rows[10]?.lift).toBeCloseTo(1, 5);
    expect(rows[9]?.lift).toBeGreaterThan(rows[7]?.lift ?? 1);
    expect(rows[0]?.lift).toBeLessThan(0.01);
  });

  it('keeps the row under the pointer in place and spreads its neighbours apart', () => {
    const pointer = 10 * 11 + 5.5;
    const rows = magnifyRows(starts, 11, pointer);
    expect((rows[10]?.y ?? 0) + (rows[10]?.height ?? 0) / 2).toBeCloseTo(pointer, 0);
    const gapBefore = (rows[10]?.y ?? 0) - (rows[9]?.y ?? 0);
    const gapFar = (rows[2]?.y ?? 0) - (rows[1]?.y ?? 0);
    expect(gapBefore).toBeGreaterThan(gapFar + 5);
  });

  it('keeps rows in order', () => {
    const rows = magnifyRows(starts, 11, 47);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index]?.y ?? 0).toBeGreaterThan(rows[index - 1]?.y ?? 0);
    }
  });

  it.each([0, 47, 105.5, 220])('keeps clickable slots contiguous at pointer %s', (pointer) => {
    const rows = magnifyRows(starts, 11, pointer);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]!;
      expect(previous.y + previous.height).toBeCloseTo(rows[index]!.y, 8);
    }
  });
});
