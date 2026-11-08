import { cleanup, render, screen } from '@testing-library/react';
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
