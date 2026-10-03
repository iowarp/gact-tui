import { describe, expect, it, vi } from 'vitest';
import { transcriptSchema } from './repository-decoders.js';
import { decodeTranscript } from './transcript-decoder.js';

function snapshot(count: number) {
  return {
    cursor: '42',
    messages: Array.from({ length: count }, (_, index) => ({
      id: `msg_${index}`,
      session_id: 'sess_1',
      role: 'assistant',
      created_at: '2026-10-03T12:00:00Z',
      blocks: [{ id: `text_${index}`, type: 'text', text: `Message ${index}` }],
    })),
  };
}

describe('cooperative transcript decoding', () => {
  it('preserves every decoded row and default while yielding to other tasks', async () => {
    vi.useFakeTimers();
    try {
      const input = snapshot(1_000);
      let completed = false;
      const decoding = decodeTranscript(input).then((value) => {
        completed = true;
        return value;
      });
      await Promise.resolve();
      expect(completed).toBe(false);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await vi.runAllTimersAsync();
      expect(await decoding).toEqual(transcriptSchema.parse(input));
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects malformed later rows with their original transcript index', async () => {
    const input = snapshot(70);
    Reflect.set(input.messages[40]!, 'id', 42);
    await expect(decodeTranscript(input)).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ path: ['messages', 40, 'id'] })]),
    });
  });

  it('cancels between batches without returning a partial snapshot', async () => {
    const controller = new AbortController();
    const decoding = decodeTranscript(snapshot(100), controller.signal);
    controller.abort();
    await expect(decoding).rejects.toMatchObject({ name: 'AbortError' });
  });
});
