import { describe, expect, it } from 'vitest';
import {
  bucketIntensity,
  findRunInRenderedText,
  formatSharePercent,
  maxRunValue,
  projectText,
} from './attention-text';

describe('projectText', () => {
  it('drops markdown markup and collapses whitespace from source text', () => {
    const source = '# Title\n\nThe **confirmed**  column, `east`.';
    const projected = projectText(source, { source: true });
    expect(projected.text).toBe('Title The confirmed column, east.');
    // Every kept non-space char maps back to itself at its recorded source offset
    // (a collapsed run's synthetic space instead shares the offset of whichever
    // real character closed the run — see the TextProjection doc comment).
    for (let i = 0; i < projected.text.length; i += 1) {
      const ch = projected.text[i] as string;
      if (ch === ' ') continue;
      expect(source[projected.index[i] as number]).toBe(ch);
    }
  });

  it('strips list markers and link targets only in source mode', () => {
    const source = '- one\n- two\n[label](https://example.com/x)';
    const asSource = projectText(source, { source: true });
    expect(asSource.text).toBe('one two label');
    const asRendered = projectText(source, { source: false });
    // Rendered mode never sees "- " or "(url)" in the first place, so it does
    // not special-case them; it only strips bare markup characters.
    expect(asRendered.text).toContain('one');
  });

  it('produces a monotonically non-decreasing index', () => {
    const { index } = projectText('a  b\n\nc', { source: true });
    for (let i = 1; i < index.length; i += 1) {
      expect(index[i]).toBeGreaterThanOrEqual(index[i - 1] as number);
    }
  });

  it('projects an empty string to empty', () => {
    expect(projectText('', { source: true })).toEqual({ text: '', index: [] });
  });
});

describe('findRunInRenderedText', () => {
  it('finds a source run inside differently-formatted rendered text', () => {
    const source = 'the **confirmed** column names';
    const domText = 'the confirmed column names'; // as rendered: no ** markers
    const domProjection = projectText(domText, { source: false });
    const rawLo = source.indexOf('confirmed');
    const rawHi = rawLo + 'confirmed'.length;
    const result = findRunInRenderedText(source, rawLo, rawHi, domProjection);
    expect(result).toBeDefined();
    expect(domText.slice(result?.domLo, result?.domHi)).toBe('confirmed');
  });

  it('walks forward with searchFrom so repeated text does not re-match an earlier run', () => {
    const source = 'east, east';
    const domText = 'east, east';
    const domProjection = projectText(domText, { source: false });
    const first = findRunInRenderedText(source, 0, 4, domProjection);
    expect(first).toBeDefined();
    const second = findRunInRenderedText(source, 6, 10, domProjection, first?.projectedEnd);
    expect(second).toBeDefined();
    expect(second?.domLo).toBeGreaterThan(first?.domLo ?? -1);
  });

  it('returns undefined when the run has no textual content', () => {
    const domProjection = projectText('anything', { source: false });
    expect(findRunInRenderedText('***', 0, 3, domProjection)).toBeUndefined();
  });

  it('returns undefined when the run is not present in the rendered text', () => {
    const domProjection = projectText('completely different text', { source: false });
    expect(findRunInRenderedText('nowhere to be found', 0, 6, domProjection)).toBeUndefined();
  });
});

describe('bucketIntensity', () => {
  it('buckets proportionally into the requested number of levels', () => {
    expect(bucketIntensity(0, 1, 4)).toBe(0);
    expect(bucketIntensity(0.24, 1, 4)).toBe(0);
    expect(bucketIntensity(0.26, 1, 4)).toBe(1);
    expect(bucketIntensity(0.51, 1, 4)).toBe(2);
    expect(bucketIntensity(0.99, 1, 4)).toBe(3);
    expect(bucketIntensity(1, 1, 4)).toBe(3);
  });

  it('never exceeds the top bucket even above max', () => {
    expect(bucketIntensity(5, 1, 4)).toBe(3);
  });

  it('degrades to bucket 0 for a non-positive max, a non-finite value, or a non-positive value', () => {
    expect(bucketIntensity(0.5, 0)).toBe(0);
    expect(bucketIntensity(Number.NaN, 1)).toBe(0);
    expect(bucketIntensity(-1, 1)).toBe(0);
  });
});

describe('formatSharePercent', () => {
  it('formats a normal share to one decimal place', () => {
    expect(formatSharePercent(0.048)).toBe('4.8%');
  });

  it('never rounds a real positive share down to a misleading 0.0%', () => {
    expect(formatSharePercent(0.00003)).toBe('<0.1%');
  });

  it('shows a true zero as 0.0%', () => {
    expect(formatSharePercent(0)).toBe('0.0%');
  });
});

describe('maxRunValue', () => {
  it('finds the largest run value across every block', () => {
    const blocks = [
      { runs: [[0, 1, 0.1] as const, [2, 3, 0.4] as const] },
      { runs: [[0, 1, 0.9] as const] },
    ];
    expect(maxRunValue(blocks)).toBe(0.9);
  });

  it('is 0 for no runs', () => {
    expect(maxRunValue([{ runs: [] }])).toBe(0);
  });
});
