import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentTextLayer } from './comment-text-layer';

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

beforeEach(() => {
  // jsdom has no layout: each text range is one 40 x 10 box, the host sits at (100, 50).
  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (this: Range) {
    const offset = this.startOffset;
    return [rect(110 + offset, 60, 40, 10)] as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 400, 300));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function frame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

function host(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  document.body.appendChild(element);
  return element;
}

describe('CommentTextLayer', () => {
  it('outlines each mark where its text is, with its label, and opens the mark from it', async () => {
    const viewer = host(
      '<p data-line="1">Checkpoints are bursts.</p><p data-line="2">Buffers absorb them.</p>',
    );
    const onOpenMark = vi.fn();
    render(
      <CommentTextLayer
        host={viewer}
        marks={[
          { label: 'S1', anchor: { profile: 'text-quote', exact: 'bursts', start: 16 } },
          { label: 'S2', anchor: { profile: 'text-quote', exact: 'not on this page' } },
        ]}
        onOpenMark={onOpenMark}
      />,
      { container: viewer.appendChild(document.createElement('div')) },
    );
    await frame();
    const mark = viewer.querySelector('[data-mark-label="S1"]')!;
    const box = mark.querySelector('div') as HTMLElement;
    // Relative to the host: the range's box at (110 + 16, 60) less the host's (100, 50).
    expect([box.style.left, box.style.top, box.style.width]).toEqual(['26px', '10px', '40px']);
    // A quote that is not in this viewer is not drawn.
    expect(viewer.querySelector('[data-mark-label="S2"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit S1' }));
    expect(onOpenMark).toHaveBeenCalledWith('S1');
  });

  it('follows the text when it changes, and keeps its own label out of the text', async () => {
    const viewer = host('<p>Checkpoints are bursts.</p>');
    render(
      <CommentTextLayer
        host={viewer}
        marks={[{ label: 'S1', anchor: { profile: 'text-quote', exact: 'bursts' } }]}
      />,
      { container: viewer.appendChild(document.createElement('div')) },
    );
    await frame();
    expect(viewer.querySelector('[data-mark-label="S1"]')).not.toBeNull();
    expect(
      viewer.querySelector('[data-slot="comment-text-layer"]')!.getAttribute('data-comment-skip'),
    ).toBe('true');
    await act(async () => {
      viewer.querySelector('p')!.textContent = 'Checkpoints are rewritten.';
    });
    await frame();
    expect(viewer.querySelector('[data-mark-label="S1"]')).toBeNull();
  });
});
