import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { holdModalBodyPointerEvents, OVERLAY_HOST_ID } from './overlay-container';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const shields = () => document.querySelectorAll('[data-slot="modal-shield"]');

afterEach(() => {
  cleanup();
  document.getElementById(OVERLAY_HOST_ID)?.remove();
  document.body.removeAttribute('data-app-shell');
  document.body.style.pointerEvents = '';
});

describe('modal layer shields', () => {
  it('holds body pointer-events only on the app shell', () => {
    holdModalBodyPointerEvents();
    expect(document.body.style.pointerEvents).toBe('');
    document.body.setAttribute('data-app-shell', '');
    holdModalBodyPointerEvents();
    expect(document.body.style.pointerEvents).toBe('none');
  });

  it('covers the page behind a modal menu in the overlay host, and not behind a non-modal one', async () => {
    const host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    document.body.append(host);
    const user = userEvent.setup();
    const { rerender } = render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(shields()).toHaveLength(1);
    expect(host.contains(shields()[0]!)).toBe(true);
    expect(shields()[0]).toHaveAttribute('aria-hidden', 'true');

    await user.keyboard('{Escape}');
    expect(shields()).toHaveLength(0);

    rerender(
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(shields()).toHaveLength(0);
  });

  it('counts as outside the component that opened the menu, so its hover ends', async () => {
    const onPointerLeave = vi.fn();
    const user = userEvent.setup();
    render(
      <div data-testid="preview" onPointerLeave={onPointerLeave}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>Actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Rename</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const shield = shields()[0]!;
    onPointerLeave.mockClear();
    fireEvent.pointerOut(screen.getByRole('button', { name: 'Actions', hidden: true }), {
      relatedTarget: shield,
    });
    fireEvent.pointerOver(shield, {
      relatedTarget: screen.getByRole('button', { name: 'Actions', hidden: true }),
    });
    expect(onPointerLeave).toHaveBeenCalled();
  });

  it('shields only modal popovers', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Popover>
        <PopoverTrigger asChild>
          <Button>Filter</Button>
        </PopoverTrigger>
        <PopoverContent>Filters</PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(shields()).toHaveLength(0);
    await user.keyboard('{Escape}');

    rerender(
      <Popover modal>
        <PopoverTrigger asChild>
          <Button>Filter</Button>
        </PopoverTrigger>
        <PopoverContent>Filters</PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(shields()).toHaveLength(1);
  });

  it('dismisses on a shield press and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button>Elsewhere</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>Actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Rename</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await waitFor(() =>
      expect(screen.getByRole('menu')).toContainElement(document.activeElement as HTMLElement),
    );
    await user.click(shields()[0]!);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus());
  });

  it('keeps Tab inside a modal popover and the page reachable to assistive tech', async () => {
    const user = userEvent.setup();
    render(
      <>
        <main>
          <Button>Elsewhere</Button>
        </main>
        <Popover modal>
          <PopoverTrigger asChild>
            <Button>Model</Button>
          </PopoverTrigger>
          <PopoverContent>
            <input aria-label="Search models" />
            <Button>Refresh</Button>
          </PopoverContent>
        </Popover>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Model' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveFocus(),
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveFocus();
    // The shield blocks the page; no aria-hidden or scroll-lock restyle of the document.
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-hidden');
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Model' })).toHaveFocus());
  });

  it('keeps Select open state observable while it shields the page', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select defaultValue="a" onOpenChange={onOpenChange}>
        <SelectTrigger aria-label="Mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(shields()).toHaveLength(0);
    await user.click(screen.getByRole('combobox', { name: 'Mode' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(shields()).toHaveLength(1);
    await user.click(screen.getByRole('option', { name: 'Beta' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(shields()).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('Beta');
  });
});
