import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyTextToClipboard,
  downloadBlob,
  downloadBytes,
  downloadText,
  downloadUrl,
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

  it('downloadUrl clicks a download anchor pointed straight at the given URL, minting no new object URL', () => {
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.href).toBe('blob:existing/abc');
      expect(this.download).toBe('photo.png');
    });

    downloadUrl('blob:existing/abc', 'photo.png');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createUrl).not.toHaveBeenCalled();
  });
});

describe('copyTextToClipboard', () => {
  const originalExecCommand = document.execCommand;
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: originalExecCommand });
    // @ts-expect-error -- restoring a test-only override
    delete navigator.clipboard;
  });

  it('resolves true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('uses a user-gesture fallback when the Clipboard API is unavailable', async () => {
    // @ts-expect-error -- simulating an environment with no Clipboard API
    delete navigator.clipboard;
    const copy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy });
    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(copy).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea[readonly]')).toBeNull();
  });

  it('resolves false when both copy methods fail', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
    await expect(copyTextToClipboard('hello')).resolves.toBe(false);
  });
});
