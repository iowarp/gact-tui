import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarMenuButton,
  useSidebar,
} from './sidebar';
import { TooltipProvider } from './tooltip';
import { createPortal } from 'react-dom';

afterEach(cleanup);

describe('sidebar vertical layout', () => {
  it('uses the available parent height instead of adding another viewport height', () => {
    const { container } = render(<SidebarProvider>Sidebar</SidebarProvider>);

    expect(container.querySelector('[data-slot="sidebar-wrapper"]')).toHaveClass(
      'h-full',
      'min-h-0',
    );
    expect(container.querySelector('[data-slot="sidebar-wrapper"]')).not.toHaveClass('min-h-svh');
  });

  it('keeps the header and footer visible while only the middle content scrolls', () => {
    render(
      <div className="flex h-48 flex-col">
        <SidebarHeader>Header</SidebarHeader>
        <SidebarContent>Scrollable content</SidebarContent>
        <SidebarFooter>Footer</SidebarFooter>
      </div>,
    );

    expect(screen.getByText('Header')).toHaveClass('shrink-0');
    expect(screen.getByText('Footer')).toHaveClass('shrink-0');
    expect(screen.getByText('Scrollable content')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
    );
  });
});

function SidebarState() {
  const { open, state } = useSidebar();
  return <button>{`${open ? 'pinned' : 'unpinned'} ${state}`}</button>;
}

function SidebarMenuState() {
  const { state } = useSidebar();
  return <SidebarMenuButton tooltip="Navigation">{state}</SidebarMenuButton>;
}

describe('collapsed navigation preview', () => {
  it('expands on pointer hover without changing the pinned state', () => {
    const { container } = render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar contained collapsible="icon">
          <SidebarState />
        </Sidebar>
      </SidebarProvider>,
    );
    const sidebar = container.querySelector('[data-slot="sidebar"]')!;
    fireEvent.pointerEnter(sidebar, { pointerType: 'mouse' });
    expect(sidebar).toHaveAttribute('data-preview', 'true');
    expect(screen.getByRole('button')).toHaveTextContent('unpinned expanded');
    fireEvent.pointerLeave(sidebar);
    expect(screen.getByRole('button')).toHaveTextContent('unpinned collapsed');
  });

  it('keeps the preview while a control has focus and dismisses with Escape', () => {
    const { container } = render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar contained collapsible="icon">
          <SidebarState />
        </Sidebar>
      </SidebarProvider>,
    );
    const sidebar = container.querySelector('[data-slot="sidebar"]')!;
    fireEvent.focus(screen.getByRole('button'));
    fireEvent.pointerLeave(sidebar);
    expect(sidebar).toHaveAttribute('data-preview', 'true');
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' });
    expect(sidebar).not.toHaveAttribute('data-preview');
    expect(sidebar).toHaveFocus();
    expect(screen.getByRole('button')).toHaveTextContent('unpinned collapsed');
  });

  it('preserves the focused menu control when preview styling replaces icon styling', () => {
    render(
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <Sidebar contained collapsible="icon">
            <SidebarMenuState />
          </Sidebar>
        </SidebarProvider>
      </TooltipProvider>,
    );
    const button = screen.getByRole('button');
    act(() => button.focus());
    expect(screen.getByRole('button')).toBe(button);
    expect(button).toHaveFocus();
    expect(button).toHaveTextContent('expanded');
    expect(button.isConnected).toBe(true);
    expect(button).not.toHaveAttribute('aria-describedby');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    escape.preventDefault(); // A tooltip can consume Escape before React receives it.
    fireEvent(button, escape);
    expect(button).toHaveTextContent('collapsed');
  });

  it('lets a portaled menu consume Escape without closing the navigation preview', () => {
    const { container } = render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar contained collapsible="icon">
          <SidebarState />
          {createPortal(
            <button onKeyDown={(event) => event.preventDefault()}>Menu item</button>,
            document.body,
          )}
        </Sidebar>
      </SidebarProvider>,
    );
    const sidebar = container.querySelector('[data-slot="sidebar"]')!;
    fireEvent.pointerEnter(sidebar, { pointerType: 'mouse' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Menu item' }), { key: 'Escape' });
    expect(sidebar).toHaveAttribute('data-preview', 'true');
  });
});
