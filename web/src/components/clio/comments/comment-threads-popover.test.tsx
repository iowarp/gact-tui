import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { CommentThreadsPopover } from './comment-threads-popover';

afterEach(cleanup);

describe('CommentThreadsPopover', () => {
  it('places the card against the palette, not the replaced trigger, under StrictMode', async () => {
    render(
      <StrictMode>
        <div data-slot="comment-controls">
          <CommentThreadsPopover align="start" beside trigger={<Button>Earlier threads</Button>}>
            <p>Thread</p>
          </CommentThreadsPopover>
        </div>
      </StrictMode>,
    );
    const palette = document.querySelector<HTMLElement>('[data-slot="comment-controls"]')!;
    palette.getBoundingClientRect = () => new DOMRect(600, 500, 256, 115);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier threads' }));
    const card = await screen.findByText('Thread');
    const wrapper = card.closest<HTMLElement>('[data-radix-popper-content-wrapper]')!;
    // Beside the palette at (600, 500); a stale 0x0 anchor puts it at the origin.
    await waitFor(() => expect(wrapper.style.transform).toMatch(/^translate\((\d+)px, (\d+)px\)$/));
    const [, x, y] = /^translate\((\d+)px, (\d+)px\)$/.exec(wrapper.style.transform)!;
    expect(Number(x)).toBeGreaterThan(400);
    expect(Number(y)).toBeGreaterThan(400);
    expect(card.closest('[data-slot="comment-threads-popover"]')?.getAttribute('data-side')).toBe(
      'left',
    );
  });

  it('puts the card above the palette when its full width does not fit beside it', async () => {
    render(
      <div data-slot="comment-controls">
        <CommentThreadsPopover align="start" beside trigger={<Button>Earlier threads</Button>}>
          <p>Thread</p>
        </CommentThreadsPopover>
      </div>,
    );
    const palette = document.querySelector<HTMLElement>('[data-slot="comment-controls"]')!;
    // 200 px from the edge leaves 184 px beside it, short of the 300 px card.
    palette.getBoundingClientRect = () => new DOMRect(200, 500, 256, 115);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier threads' }));
    const card = await screen.findByText('Thread');
    await waitFor(() =>
      expect(card.closest('[data-slot="comment-threads-popover"]')?.getAttribute('data-side')).toBe(
        'top',
      ),
    );
  });
});
