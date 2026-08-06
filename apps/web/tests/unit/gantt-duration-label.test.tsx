/**
 * A6 (owner-quoted, live UI watcher finding, narrow obs modal): the gantt's
 * duration label ("3m 58s") rendered as "3m 4" — clipped mid-character with
 * no ellipsis — because its `left` offset was a raw PERCENTAGE of the
 * lane's width (up to 97%), which in a narrow modal left only a handful of
 * real pixels before the plot's `overflow: hidden` cut it off.
 *
 * jsdom does no real layout (`tests/setup.ts`'s ResizeObserver mock reads
 * `getBoundingClientRect()`, which is all-zero here), so this asserts the
 * MODEL — the `left` style actually emitted reserves real pixels via CSS
 * `min()`, not just a percentage — the same "assert the model, verify pixels
 * in the browser pass" split gantt-model.test.ts already uses. The visual
 * proof (label fits, un-clipped, at a narrow width) is the Playwright
 * before/after screenshot pair.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Gantt } from '../../src/observability/Gantt';
import type { ObsSpan } from '../../src/observability/types';

describe('gantt duration label reserves real pixels from the plot edge (row-render defect A6)', () => {
  it('a span spanning the full extent (worst-case right-edge position) gets a pixel-reserving left offset, never a bare percentage', () => {
    const spans: ObsSpan[] = [
      {
        id: 'span_1',
        label: 'compute #1',
        depth: 0,
        startMs: 0,
        endMs: 1_000_000,
        state: 'done',
        duration: '16m 40s',
      },
    ];
    render(<Gantt spans={spans} />);
    const label = screen.getByTestId('obs-gantt-duration');
    expect(label).toHaveTextContent('16m 40s');
    const left = label.style.left;
    // Must combine the geometry-driven percentage with a PIXEL floor via
    // CSS min() -- a bare "97%" (the pre-fix behaviour) leaves no reserved
    // room at all in a narrow container.
    expect(left).toMatch(/^min\(/);
    expect(left).toContain('calc(100% - 72px)');
  });

  it('a short/early span (plenty of room) still positions right after the bar -- unchanged for the common case', () => {
    const spans: ObsSpan[] = [
      {
        id: 'span_1',
        label: 'compute #1',
        depth: 0,
        startMs: 0,
        endMs: 50_000,
        state: 'done',
        duration: '50s',
      },
      // A second, later span so the full extent isn't just this one bar --
      // keeps the first bar's own left+width well under the 97% cap.
      {
        id: 'span_2',
        label: 'compute #2',
        depth: 0,
        startMs: 900_000,
        endMs: 1_000_000,
        state: 'done',
        duration: '1m 40s',
      },
    ];
    render(<Gantt spans={spans} />);
    const labels = screen.getAllByTestId('obs-gantt-duration');
    const first = labels.find((el) => el.textContent === '50s');
    expect(first).toBeDefined();
    // Still reserves the same pixel floor -- the clamp is unconditional --
    // but for a bar nowhere near the right edge the percentage term wins.
    expect(first!.style.left).toMatch(/^min\(/);
  });
});
