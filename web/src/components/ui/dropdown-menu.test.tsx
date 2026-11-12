import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { OVERLAY_HOST_ID } from './overlay-container';

// jsdom runs no CSS animations. Giving the menu its enter and exit animation names
// keeps a closed menu mounted while it "fades out", as it does in a browser.
beforeEach(() => {
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    if (element.getAttribute('data-slot') !== 'dropdown-menu-content') return style;
    // Live, like a real computed style: Radix keeps the object and reads it on close.
    return new Proxy(style, {
      get: (target, key) =>
        key === 'animationName'
          ? element.getAttribute('data-state') === 'open'
            ? 'enter'
            : 'exit'
          : Reflect.get(target, key, target),
    });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.getElementById(OVERLAY_HOST_ID)?.remove();
});

function Menu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Rate response</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={false}>Pin</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Opens the menu, then closes it; it stays mounted, fading out. */
async function renderClosingMenu(onOpenChange?: (open: boolean) => void, before?: ReactNode) {
  const view = render(
    <>
      {before}
      <Menu open onOpenChange={onOpenChange} />
    </>,
  );
  // The layer starts listening for outside presses on the next task.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  view.rerender(
    <>
      {before}
      <Menu open={false} onOpenChange={onOpenChange} />
    </>,
  );
  expect(screen.getByRole('menu', { hidden: true })).toHaveAttribute('data-state', 'closed');
  onOpenChange && vi.mocked(onOpenChange).mockClear();
  return view;
}

describe('a dropdown menu that is closing', () => {
  it('keeps focus where the chosen item put it when the pointer leaves', async () => {
    await renderClosingMenu(undefined, <textarea aria-label="Comment" />);
    const comment = screen.getByRole('textbox', { name: 'Comment' });
    comment.focus();
    for (const name of ['Rate response', 'Pin']) {
      fireEvent.pointerLeave(screen.getByText(name), { pointerType: 'mouse' });
      expect(comment).toHaveFocus();
    }
  });

  it('lets a press on its trigger reopen the menu', async () => {
    render(
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    const press = () => fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    press();
    const menu = screen.getByRole('menu');
    // The layer starts listening for outside presses on the next task.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(menu).toHaveAttribute('data-state', 'closed');
    press();
    expect(screen.getByRole('menu')).toHaveAttribute('data-state', 'open');
  });
});
