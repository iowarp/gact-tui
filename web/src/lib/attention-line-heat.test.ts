import { describe, expect, it } from 'vitest';
import { lineHeat, lineLevel, sourceLines } from './attention-line-heat';

/** Round 5 of exp32-chain-0020-hard: one rendered paragraph, three source lines. */
const QUESTION =
  'For the accession identified in round 2: which accession is its nearest\n' +
  "analogue by Fv/Fm_Lss dose-response profile, and does that analogue's own\n" +
  'peak fall on the dose you identified in round 1?';

describe('sourceLines', () => {
  it('splits at line breaks, each line stopping before its break', () => {
    expect(sourceLines('ab\ncd\n\nef')).toEqual([
      { lo: 0, hi: 2 },
      { lo: 3, hi: 5 },
      { lo: 6, hi: 6 },
      { lo: 7, hi: 9 },
    ]);
  });

  it('counts Unicode code points, as heat runs do', () => {
    expect(sourceLines('🧭 a\nb')).toEqual([
      { lo: 0, hi: 3 },
      { lo: 4, hi: 5 },
    ]);
  });
});

describe('lineHeat', () => {
  const [first, second, third] = sourceLines(QUESTION);

  it('gives a wrapped paragraph one value per source line', () => {
    const heat = lineHeat(
      QUESTION,
      [
        [first!.lo, first!.lo + 3, 0.2],
        [first!.lo + 8, first!.lo + 18, 0.6],
        [second!.lo, second!.lo + 8, 0.9],
        [third!.lo + 5, third!.lo + 9, 0.1],
      ],
      'max',
    );
    expect(heat.map((line) => [line.lo, line.value, line.measured])).toEqual([
      [first!.lo, 0.6, 2],
      [second!.lo, 0.9, 1],
      [third!.lo, 0.1, 1],
    ]);
  });

  it('averages measured tokens in mean mode', () => {
    const heat = lineHeat(
      QUESTION,
      [
        [0, 3, 0.2],
        [8, 18, 0.6],
      ],
      'mean',
    );
    expect(heat).toHaveLength(1);
    expect(heat[0]?.value).toBeCloseTo(0.4);
  });

  it('leaves out lines without a measured token', () => {
    const heat = lineHeat(QUESTION, [[third!.lo, third!.lo + 4, 0.5]], 'max');
    expect(heat).toEqual([{ ...third, value: 0.5, measured: 1 }]);
  });

  it('counts a token that starts at a line break for the line it closes', () => {
    // Granite 4.2 writes "." and "\n" as separate tokens; the "\n" closes line 0.
    const text = 'nearest.\nanalogue';
    const heat = lineHeat(
      text,
      [
        [8, 9, 0.7],
        [9, 17, 0.3],
      ],
      'max',
    );
    expect(heat.map((line) => [line.lo, line.value])).toEqual([
      [0, 0.7],
      [9, 0.3],
    ]);
  });

  it('accepts runs in any order and ignores non-finite values', () => {
    const heat = lineHeat(
      'a\nb',
      [
        [2, 3, 0.4],
        [0, 1, Number.NaN],
        [0, 1, 0.2],
      ],
      'max',
    );
    expect(heat.map((line) => line.value)).toEqual([0.2, 0.4]);
  });
});

describe('lineLevel', () => {
  it("rounds like render_heatmap.py's round(9 * value / max)", () => {
    expect(lineLevel(1, 1)).toBe(9);
    expect(lineLevel(0.5, 1)).toBe(5);
    expect(lineLevel(0.05, 1)).toBe(0);
    expect(lineLevel(0.06, 1)).toBe(1);
  });

  it('is 0 for missing or non-positive signals', () => {
    expect(lineLevel(0, 1)).toBe(0);
    expect(lineLevel(0.5, 0)).toBe(0);
    expect(lineLevel(Number.NaN, 1)).toBe(0);
  });
});
