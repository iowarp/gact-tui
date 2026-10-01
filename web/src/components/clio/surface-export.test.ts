import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyTextToClipboard,
  downloadBlob,
  downloadBytes,
  downloadText,
  filenameStemFromTitle,
  rowsToCsv,
  rowsToJson,
} from './surface-export';

describe('filenameStemFromTitle', () => {
  it('slugifies a title into a safe filename stem', () => {
    expect(filenameStemFromTitle('Depth vs. Magnitude (2024)')).toBe('Depth_vs._Magnitude_2024');
  });

  it('falls back to a default stem for an empty or missing title', () => {
    expect(filenameStemFromTitle(undefined)).toBe('export');
    expect(filenameStemFromTitle('   ')).toBe('export');
  });
});

describe('rowsToCsv', () => {
  it('quotes a comma/quote/newline-bearing cell, and escapes embedded quotes', () => {
    const csv = rowsToCsv(['name', 'note'], [{ name: 'a, b', note: 'has "quotes"' }]);
    expect(csv).toBe('name,note\r\n"a, b","has ""quotes"""');
  });

  it('renders a null/undefined cell as empty, never the literal word', () => {
    expect(rowsToCsv(['x'], [{ x: null }, { x: undefined }])).toBe('x\r\n\r\n');
  });
});

describe('rowsToJson', () => {
  it('projects rows to exactly the given columns, in order', () => {
    const json = rowsToJson(['b', 'a'], [{ a: 1, b: 2, c: 3 }]);
    expect(JSON.parse(json)).toEqual([{ a: 1, b: 2 }]);
  });
});

describe('browser download helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloadBlob creates an object URL, clicks a download anchor, and revokes it later', () => {
    vi.useFakeTimers();
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['x']), 'report.csv');

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith('blob:fake');
    vi.useRealTimers();
  });

  it('downloadBytes and downloadText build a Blob of the right type', () => {
    const seen: BlobPropertyBag[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(((blob: Blob) => {
      seen.push({ type: blob.type });
      return 'blob:fake';
    }) as typeof URL.createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBytes('abc', 'application/vnd.apache.parquet', 'd.parquet');
    downloadText('<svg/>', 'image/svg+xml', 'd.svg');

    expect(seen.map((entry) => entry.type)).toEqual([
      'application/vnd.apache.parquet',
      'image/svg+xml',
    ]);
  });
});

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- restoring a test-only override
    delete navigator.clipboard;
  });

  it('resolves true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('resolves false (never throws) when the clipboard API is unavailable', async () => {
    // @ts-expect-error -- simulating an environment with no Clipboard API
    delete navigator.clipboard;
    await expect(copyTextToClipboard('hello')).resolves.toBe(false);
  });

  it('resolves false (never throws) when the clipboard API rejects', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await expect(copyTextToClipboard('hello')).resolves.toBe(false);
  });
});
