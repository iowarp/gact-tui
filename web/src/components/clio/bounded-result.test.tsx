import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoundedResult } from './bounded-result';
import { displayLineBottoms } from './display-line-geometry';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function geometry(lines: number) {
  Range.prototype.getClientRects = vi.fn(
    () =>
      Array.from({ length: lines }, (_, i) => ({
        top: i * 24,
        bottom: (i + 1) * 24,
        width: 100,
        height: 24,
      })) as unknown as DOMRectList,
  );
}

describe('display-line result previews', () => {
  it('counts soft-wrapped layout boxes rather than newline characters', () => {
    geometry(12);
    const node = document.createElement('div');
    node.textContent = 'A long single paragraph with no newline characters';
    expect(displayLineBottoms(node)).toHaveLength(12);
  });
  it('reveals another page, preserves focus, then offers Show less', async () => {
    geometry(12);
    render(
      <BoundedResult lines={5}>
        <p>Long wrapped result</p>
      </BoundedResult>,
    );
    const button = screen.getByRole('button', { name: 'Show more' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'true'));
    expect(button).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('10 display lines');
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Show less' })).toBe(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
  it('fetches remote content only when the next display page needs it', async () => {
    geometry(15);
    const load = vi.fn(async () => {});
    render(
      <BoundedResult lines={5} hasMore loadMore={load}>
        <p>Loaded prefix</p>
      </BoundedResult>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
  });
});
