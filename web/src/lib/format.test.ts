import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, truncate } from './format';

describe('formatBytes', () => {
  it('reads decimal units so the number matches the KB/MB/GB label it renders', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1_000)).toBe('1.0 KB');
    expect(formatBytes(1_500_000)).toBe('1.5 MB');
    expect(formatBytes(2_400_000_000)).toBe('2.4 GB');
    expect(formatBytes(3_000_000_000_000)).toBe('3.0 TB');
  });

  it('keeps a value below the next unit rather than rolling it over', () => {
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(999_999)).toBe('1000.0 KB');
  });

  it('renders nothing for a value that is not a finite size', () => {
    expect(formatBytes(Number.NaN)).toBe('');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('formatDuration', () => {
  it('spells out units by default and adds seconds past a minute', () => {
    expect(formatDuration(840)).toBe('840 ms');
    expect(formatDuration(9_400)).toBe('9 s');
    expect(formatDuration(150_000)).toBe('2 min 30 s');
    expect(formatDuration(120_000)).toBe('2 min');
  });

  it('keeps one decimal below a minute in the tenths style', () => {
    expect(formatDuration(1_540, 'tenths')).toBe('1.5 s');
    expect(formatDuration(2_000, 'tenths')).toBe('2 s');
    expect(formatDuration(150_000, 'tenths')).toBe('2 min 30 s');
  });

  it('uses single-letter units in the compact style and never reports zero seconds', () => {
    expect(formatDuration(120, 'compact')).toBe('1s');
    expect(formatDuration(9_400, 'compact')).toBe('9s');
    expect(formatDuration(150_000, 'compact')).toBe('3m');
  });

  it('treats a negative elapsed time as zero rather than printing a negative', () => {
    expect(formatDuration(-5)).toBe('0 ms');
  });
});

describe('truncate', () => {
  it('leaves a value that already fits untouched', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('exactly-10', 10)).toBe('exactly-10');
  });

  it('spends the last character on the ellipsis so the budget is never exceeded', () => {
    const cut = truncate('abcdefghijkl', 10);
    expect(cut).toBe('abcdefghi…');
    expect(cut.length).toBe(10);
  });

  it('does not leave whitespace stranded before the ellipsis', () => {
    expect(truncate('abcdefgh ijkl', 10)).toBe('abcdefgh…');
  });
});
