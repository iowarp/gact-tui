import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCompactBytes,
  formatDuration,
  formatResourceSize,
  truncate,
} from './format';

describe('formatBytes', () => {
  it('reads binary units under the KB/MB/GB labels, as file managers do', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1_024)).toBe('1.0 KB');
    expect(formatBytes(1.5 * 1_024 ** 2)).toBe('1.5 MB');
    expect(formatBytes(3_650_722_201)).toBe('3.4 GB');
    expect(formatBytes(3 * 1_024 ** 4)).toBe('3.0 TB');
  });

  it('drops a trailing .0 only from ten up', () => {
    expect(formatBytes(5 * 1_024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(200 * 1_024 ** 2)).toBe('200 MB');
  });

  it('rolls into the next unit rather than printing a four-digit value', () => {
    expect(formatBytes(1_023)).toBe('1023 B');
    expect(formatBytes(999_999)).toBe('976.6 KB');
    expect(formatBytes(1_023 * 1_024)).toBe('1.0 MB');
  });

  it('renders nothing for a value that is not a finite size', () => {
    expect(formatBytes(Number.NaN)).toBe('');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('formatCompactBytes', () => {
  it('fits a fixed list column: one decimal only below ten, at most six characters', () => {
    expect(formatCompactBytes(512)).toBe('512 B');
    expect(formatCompactBytes(2_000)).toBe('2.0 KB');
    expect(formatCompactBytes(54 * 1_024)).toBe('54 KB');
    expect(formatCompactBytes(540 * 1_024)).toBe('540 KB');
    expect(formatCompactBytes(1_023 * 1_024)).toBe('1.0 MB');
    expect(formatCompactBytes(9.96 * 1_024)).toBe('10 KB');
    expect(formatCompactBytes(-1)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('spells out units by default and adds seconds past a minute', () => {
    expect(formatDuration(840)).toBe('840 ms');
    expect(formatDuration(9_400)).toBe('9 s');
    expect(formatDuration(150_000)).toBe('2 min 30 s');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(119_999)).toBe('2 min');
  });

  it('fits the transcript elapsed column: tenths under ten seconds, then whole units', () => {
    expect(formatDuration(400, 'elapsed')).toBe('0.4s');
    expect(formatDuration(8_200, 'elapsed')).toBe('8.2s');
    expect(formatDuration(9_970, 'elapsed')).toBe('10s');
    expect(formatDuration(41_000, 'elapsed')).toBe('41s');
    expect(formatDuration(125_000, 'elapsed')).toBe('2m 5s');
    expect(formatDuration(3_840_000, 'elapsed')).toBe('1h 4m');
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

describe('formatResourceSize', () => {
  it('reads a workspace resource size through the one shared byte formatter', () => {
    expect(formatResourceSize(0)).toBe('0 B');
    expect(formatResourceSize(4)).toBe('4 B');
    expect(formatResourceSize(1.5 * 1_024 ** 2)).toBe('1.5 MB');
  });

  it('says a size is unavailable rather than rendering a number that is not one', () => {
    expect(formatResourceSize(-1)).toBe('Unavailable');
    expect(formatResourceSize(Number.NaN)).toBe('Unavailable');
    expect(formatResourceSize(Number.POSITIVE_INFINITY)).toBe('Unavailable');
  });
});
