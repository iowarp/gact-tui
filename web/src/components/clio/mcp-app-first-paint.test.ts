import type { McpAppSnapshot } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_PAINT_PROBES_MS,
  paintVerdict,
  watchFirstPaint,
  type PaintVerdict,
} from './mcp-app-first-paint';

function shot(painted: Record<string, number>, skipped: string[] = []): McpAppSnapshot {
  return {
    image: 'data:image/png;base64,AA==',
    width: 100,
    height: 100,
    scale: 0.25,
    painted,
    skipped: skipped.map((reason) => ({ what: 'canvas', reason })) as never,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('paintVerdict', () => {
  it('reads any painted element as drawn', () => {
    expect(paintVerdict(shot({ canvas: 0, image: 1 }))).toBe('drawn');
    expect(paintVerdict(shot({ text: 3 }))).toBe('drawn');
  });

  it('reads nothing painted as blank, including a canvas that never redrew', () => {
    expect(paintVerdict(shot({ canvas: 0, text: 0 }))).toBe('blank');
    expect(paintVerdict(shot({}, ['webgl_frame_not_redrawn']))).toBe('blank');
    expect(paintVerdict({ error: { reason: 'view_not_laid_out', message: '' } })).toBe('blank');
  });

  it('cannot tell when pixels are unreadable or the snapshot was refused', () => {
    expect(paintVerdict(shot({}, ['cross_origin_pixels']))).toBe('unknown');
    expect(paintVerdict({ error: { reason: 'snapshot_tainted', message: '' } })).toBe('unknown');
  });
});

describe('watchFirstPaint', () => {
  it('says drawing until a look shows something, then stops looking', async () => {
    vi.useFakeTimers();
    const take = vi
      .fn()
      .mockResolvedValueOnce(shot({}))
      .mockResolvedValueOnce(shot({ canvas: 1 }));
    const verdicts: PaintVerdict[] = [];
    watchFirstPaint(take, (verdict) => verdicts.push(verdict));
    expect(verdicts).toEqual(['pending']);
    await vi.advanceTimersByTimeAsync(FIRST_PAINT_PROBES_MS[0]);
    expect(verdicts).toEqual(['pending']);
    await vi.advanceTimersByTimeAsync(FIRST_PAINT_PROBES_MS[1]);
    expect(verdicts).toEqual(['pending', 'drawn']);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(take).toHaveBeenCalledTimes(2);
  });

  it('reports blank after its last look, and looks again after a resize', async () => {
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}));
    const verdicts: PaintVerdict[] = [];
    const watch = watchFirstPaint(take, (verdict) => verdicts.push(verdict));
    await vi.advanceTimersByTimeAsync(FIRST_PAINT_PROBES_MS.reduce((a, b) => a + b, 0));
    expect(verdicts.at(-1)).toBe('blank');
    expect(take).toHaveBeenCalledTimes(FIRST_PAINT_PROBES_MS.length);
    take.mockResolvedValue(shot({ image: 1 }));
    watch.recheck();
    await vi.advanceTimersByTimeAsync(1000);
    expect(verdicts.at(-1)).toBe('drawn');
  });

  it('never looks after it is stopped', async () => {
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}));
    const watch = watchFirstPaint(take, () => undefined);
    watch.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(take).not.toHaveBeenCalled();
  });
});
