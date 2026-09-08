import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoundedResult } from './bounded-result';
import { displayLineBottoms } from './display-line-geometry';
import userEvent from '@testing-library/user-event';

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
  it('keeps three whole checklist items rather than slicing a wrapped item', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return {
        top: 0,
        bottom: this.tagName === 'LI' ? Number(this.getAttribute('data-bottom')) : 0,
      } as DOMRect;
    });
    const { container } = render(
      <BoundedResult lines={3} unit="items">
        <ul>
          <li data-bottom="48">Wrapped first task</li>
          <li data-bottom="96">Wrapped second task</li>
          <li data-bottom="144">Wrapped third task</li>
          <li data-bottom="192">Fourth task</li>
        </ul>
      </BoundedResult>,
    );
    expect(container.querySelector('[id]')).toHaveStyle({ maxHeight: '144px' });
    expect(screen.getByRole('button', { name: 'Show more' })).toBeVisible();
    expect(container.querySelectorAll('li[inert]')).toHaveLength(1);
    expect(container.querySelector('li:last-child')).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(container.querySelectorAll('li[inert]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(container.querySelectorAll('li[inert]')).toHaveLength(1);
  });
  it('does not pad short results to the maximum or offer unnecessary expansion', () => {
    geometry(2);
    const { container } = render(
      <BoundedResult lines={10}>
        <p>Short diff</p>
      </BoundedResult>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('[id]')).not.toHaveStyle({ maxHeight: '240px' });
  });
  it('opens long local output with the keyboard and restores focus on close', async () => {
    geometry(40);
    const user = userEvent.setup();
    render(
      <BoundedResult lines={5}>
        <p>Long result</p>
      </BoundedResult>,
    );
    const button = screen.getByRole('button', { name: 'Show more' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
  it('counts soft-wrapped layout boxes rather than newline characters', () => {
    geometry(12);
    const node = document.createElement('div');
    node.textContent = 'A long single paragraph with no newline characters';
    expect(displayLineBottoms(node)).toHaveLength(12);
  });
  it('does not spend visual preview lines on screen-reader-only status labels', () => {
    geometry(1);
    const node = document.createElement('div');
    const status = document.createElement('span');
    status.className = 'sr-only';
    status.textContent = 'Pending';
    node.append(status);
    expect(displayLineBottoms(node)).toEqual([]);
  });
  it('reveals the complete short result once, preserves focus, then offers Show less', async () => {
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
    expect(screen.getByRole('status')).toHaveTextContent('Complete result revealed');
    expect(screen.getByRole('button', { name: 'Show less' })).toBe(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
  it('opens remote content separately and loads it only on explicit expansion', async () => {
    geometry(15);
    const load = vi.fn(async () => {});
    render(
      <BoundedResult lines={5} hasMore loadMore={load}>
        <p>Loaded prefix</p>
      </BoundedResult>,
    );
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
