import type { McpAppSnapshot } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_PAINT_PROBES_MS,
  RESIZE_RECHECK_MS,
  paintVerdict,
  reportedStopped,
  reportedUndrawn,
  watchFirstPaint,
  type PaintVerdict,
} from './mcp-app-first-paint';

describe('reportedUndrawn', () => {
  it('takes the view at its word when it says it shows nothing', () => {
    expect(
      reportedUndrawn({
        content: [{ type: 'text', text: 'Not drawn yet: this view has not reached ParaView.' }],
        structuredContent: { scene: 's1', drawn: false, waiting: 'connecting' },
      }),
    ).toBe('Not drawn yet: this view has not reached ParaView.');
    expect(reportedUndrawn({ structuredContent: { drawn: false } })).toBe('');
  });

  it('claims nothing for a view that does not say it is undrawn', () => {
    expect(reportedUndrawn({ structuredContent: { scene: 's1', time: 3 } })).toBeNull();
    expect(reportedUndrawn({ structuredContent: { drawn: true } })).toBeNull();
    expect(reportedUndrawn({ content: [{ type: 'text', text: 'x' }] })).toBeNull();
  });
});

describe('reportedStopped', () => {
  it('reads a stopped service even when the last picture stays', () => {
    expect(
      reportedStopped({
        content: [{ type: 'text', text: 'The view stopped.' }],
        structuredContent: { drawn: true, stopped: 'ParaView stopped: the pvserver went.' },
      }),
    ).toBe('ParaView stopped: the pvserver went.');
    expect(
      reportedStopped({
        content: [{ type: 'text', text: 'The view stopped.' }],
        structuredContent: { stopped: true },
      }),
    ).toBe('The view stopped.');
  });

  it('claims nothing without a stopped report', () => {
    expect(reportedStopped({ structuredContent: { drawn: true } })).toBeNull();
    expect(reportedStopped({ structuredContent: { drawn: false, stopped: '' } })).toBeNull();
    expect(reportedStopped({ structuredContent: { stopped: false } })).toBeNull();
    expect(reportedStopped({})).toBeNull();
  });
});

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

  it('reads chrome around a silent WebGL drawing as blank, and a near-empty picture too', () => {
    const icons = shot({ svg: 2, canvas: 1 }, ['webgl_frame_not_redrawn']);
    expect(paintVerdict(icons, 0.01)).toBe('blank');
    expect(paintVerdict(icons, 0.2)).toBe('drawn');
    expect(paintVerdict(shot({ svg: 1 }), 0.003)).toBe('blank');
    expect(paintVerdict(shot({ svg: 1 }), 0.06)).toBe('drawn');
    expect(paintVerdict(icons)).toBe('drawn');
  });

  it('cannot tell when pixels are unreadable or the snapshot was refused', () => {
    expect(paintVerdict(shot({}, ['cross_origin_pixels']))).toBe('unknown');
    expect(paintVerdict({ error: { reason: 'snapshot_tainted', message: '' } })).toBe('unknown');
  });
});

describe('watchFirstPaint', () => {
  const lastProbe = FIRST_PAINT_PROBES_MS[FIRST_PAINT_PROBES_MS.length - 1];

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
    await vi.advanceTimersByTimeAsync(FIRST_PAINT_PROBES_MS[1] - FIRST_PAINT_PROBES_MS[0]);
    expect(verdicts).toEqual(['pending', 'drawn']);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(take).toHaveBeenCalledTimes(2);
  });

  it('waits out a remote first frame: blank looks stay drawing for about 30 s', async () => {
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}));
    const verdicts: PaintVerdict[] = [];
    watchFirstPaint(take, (verdict) => verdicts.push(verdict));
    // A ParaView frame from a cluster arrives after 8–21 s.
    await vi.advanceTimersByTimeAsync(21_000);
    expect(verdicts).toEqual(['pending']);
    take.mockResolvedValue(shot({ canvas: 1 }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(verdicts).toEqual(['pending', 'drawn']);
  });

  it('notices a late first frame within 3 s of it landing', async () => {
    const late = FIRST_PAINT_PROBES_MS.filter((offset) => offset >= 10_000);
    expect(late.slice(1).every((offset, i) => offset - late[i]! <= 3_000)).toBe(true);
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}));
    const verdicts: PaintVerdict[] = [];
    watchFirstPaint(take, (verdict) => verdicts.push(verdict));
    await vi.advanceTimersByTimeAsync(20_000);
    take.mockResolvedValue(shot({ canvas: 1 }));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(verdicts).toEqual(['pending', 'drawn']);
  });

  it('reports blank after its last look, and looks again after a resize', async () => {
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}));
    const verdicts: PaintVerdict[] = [];
    const watch = watchFirstPaint(take, (verdict) => verdicts.push(verdict));
    await vi.advanceTimersByTimeAsync(lastProbe - 1);
    expect(verdicts).toEqual(['pending']);
    await vi.advanceTimersByTimeAsync(1);
    expect(verdicts.at(-1)).toBe('blank');
    expect(take).toHaveBeenCalledTimes(FIRST_PAINT_PROBES_MS.length);
    take.mockResolvedValue(shot({ image: 1 }));
    watch.recheck();
    await vi.advanceTimersByTimeAsync(1000);
    expect(verdicts.at(-1)).toBe('drawn');
  });

  it('looks sooner on a recheck inside the window without shortening it', async () => {
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}));
    const verdicts: PaintVerdict[] = [];
    const watch = watchFirstPaint(take, (verdict) => verdicts.push(verdict));
    await vi.advanceTimersByTimeAsync(3_000);
    const before = take.mock.calls.length;
    // The view reports state before its first frame (clio-kit resends model context).
    watch.recheck();
    await vi.advanceTimersByTimeAsync(RESIZE_RECHECK_MS);
    expect(take).toHaveBeenCalledTimes(before + 1);
    await vi.advanceTimersByTimeAsync(lastProbe - 3_000 - RESIZE_RECHECK_MS - 1);
    expect(verdicts).toEqual(['pending']);
    await vi.advanceTimersByTimeAsync(1);
    expect(verdicts).toEqual(['pending', 'blank']);
  });

  it('settles at once on a view it cannot read', async () => {
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}, ['cross_origin_pixels']));
    const verdicts: PaintVerdict[] = [];
    watchFirstPaint(take, (verdict) => verdicts.push(verdict));
    await vi.advanceTimersByTimeAsync(FIRST_PAINT_PROBES_MS[0]);
    expect(verdicts).toEqual(['pending', 'unknown']);
  });

  it('never looks after it is stopped', async () => {
    vi.useFakeTimers();
    const take = vi.fn().mockResolvedValue(shot({}));
    const watch = watchFirstPaint(take, () => undefined);
    watch.stop();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(take).not.toHaveBeenCalled();
  });
});
