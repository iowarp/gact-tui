import { describe, expect, it, vi } from 'vitest';
import { readOperationPages } from './tool-operation-paging';

const reference = { sha256: 'original', session_id: 'owner', scope: 'results' };
const fragment = (text: string, offset: number, next: string | null) => ({
  result_reference: reference,
  result: { preview: text, truncated: next !== null },
  offset,
  next_offset: offset + Array.from(text).length,
  next_cursor: next,
  fragments_require_concatenation: true,
});

describe('pinned result assembly', () => {
  it('concatenates Unicode fragments before parsing and returns the actual answer', async () => {
    const first = '{"answer":"Report 😀';
    const last = ' and evidence"}';
    const read = vi.fn().mockResolvedValue(fragment(last, Array.from(first).length, null));
    expect(
      await readOperationPages(
        fragment(first, 0, 'pinned-next'),
        read,
        new AbortController().signal,
      ),
    ).toBe('Report 😀 and evidence');
    expect(read).toHaveBeenCalledWith('pinned-next', expect.any(AbortSignal));
  });
  it('rejects a missing start rather than requesting the latest result', async () => {
    const read = vi.fn();
    await expect(
      readOperationPages(fragment('tail', 12, null), read, new AbortController().signal),
    ).rejects.toThrow('beginning');
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects a changed result hash', async () => {
    const read = vi.fn().mockResolvedValue({
      ...fragment('"}', 2, null),
      result_reference: { sha256: 'replacement' },
    });
    await expect(
      readOperationPages(fragment('{"', 0, 'next'), read, new AbortController().signal),
    ).rejects.toThrow('changed');
  });
  it('rejects a skipped or repeated offset and a repeated continuation', async () => {
    await expect(
      readOperationPages(
        fragment('x', 0, 'next'),
        vi.fn().mockResolvedValue(fragment('y', 0, 'next')),
        new AbortController().signal,
      ),
    ).rejects.toThrow('changed');
    await expect(
      readOperationPages(
        fragment('x', 0, 'next'),
        vi.fn().mockResolvedValue(fragment('y', 1, 'next')),
        new AbortController().signal,
      ),
    ).rejects.toThrow('continuation');
  });
  it('cancels without reading further pages', async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    await expect(
      readOperationPages(fragment('x', 0, 'next'), read, controller.signal),
    ).rejects.toThrow('cancelled');
    expect(read).not.toHaveBeenCalled();
  });
  it('preserves scalar results', async () => {
    for (const value of [false, 0, null, ''])
      expect(
        await readOperationPages(
          fragment(JSON.stringify({ answer: value }), 0, null),
          vi.fn(),
          new AbortController().signal,
        ),
      ).toBe(value);
  });
});
