import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceFileRange } from '@clio/core/v3';
import {
  decodeTextHead,
  decodeTextTail,
  readHeadWindow,
  type TextWindowPage,
} from './use-workspace-text-window';

const encode = (text: string) => new TextEncoder().encode(text);

function ranged(file: Uint8Array) {
  return vi.fn(async (range: WorkspaceFileRange) =>
    'suffix' in range
      ? file.slice(Math.max(0, file.length - range.suffix))
      : file.slice(range.start, range.end + 1),
  );
}

describe('readHeadWindow', () => {
  it('asks for one byte past the window to tell an exact fit from a longer file', async () => {
    const read = ranged(encode('0123456789'));
    await expect(readHeadWindow(read, 0, 10)).resolves.toMatchObject({ last: true });
    expect(read).toHaveBeenCalledWith({ start: 0, end: 10 });
    const longer = await readHeadWindow(ranged(encode('0123456789AB')), 0, 10);
    expect(longer).toMatchObject({ last: false, rangeIgnored: false });
    expect(longer.bytes).toHaveLength(10);
  });

  it('keeps a bounded copy of the head when the service ignores Range', async () => {
    const whole = encode('x'.repeat(100));
    const page = await readHeadWindow(async () => whole, 0, 10, 40);
    expect(page).toMatchObject({ last: false, rangeIgnored: true });
    expect(page.bytes).toHaveLength(40);
    // A copy, so the whole response body can be collected.
    expect(page.bytes.buffer).not.toBe(whole.buffer);
    const small = await readHeadWindow(async () => encode('y'.repeat(30)), 0, 10, 40);
    expect(small).toMatchObject({ last: true, rangeIgnored: true });
  });
});

describe('decodeTextHead', () => {
  const page = (text: string | Uint8Array, start: number, last = false): TextWindowPage => ({
    start,
    bytes: typeof text === 'string' ? encode(text) : text,
    last,
    rangeIgnored: false,
  });

  it('ends a partial head on its last whole line', () => {
    expect(decodeTextHead([page('one\ntwo\nthr', 0)])).toEqual({
      text: 'one\ntwo\n',
      loadedBytes: 11,
      complete: false,
      capped: false,
    });
    expect(decodeTextHead([page('one\ntwo\nthr', 0), page('ee\n', 11, true)]).text).toBe(
      'one\ntwo\nthree\n',
    );
  });

  it('decodes a character split across windows', () => {
    const bytes = encode('μ\n');
    const head = decodeTextHead([page(bytes.slice(0, 1), 0), page(bytes.slice(1), 1, true)]);
    expect(head.text).toBe('μ\n');
  });

  it('is capped once the window budget is spent', () => {
    expect(decodeTextHead([page('a\nb\n', 0), page('c\nd', 4)], 7).capped).toBe(true);
    expect(decodeTextHead([page('a\nb\n', 0)], 8).capped).toBe(false);
  });
});

describe('decodeTextTail', () => {
  it('starts at the first whole line of a full window', () => {
    expect(decodeTextTail(encode('ial\nlast line\n'), 14)).toBe('last line\n');
  });

  it('keeps a short file whole', () => {
    expect(decodeTextTail(encode('only\nlines\n'), 64)).toBe('only\nlines\n');
  });
});
