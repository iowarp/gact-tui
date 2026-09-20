import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider } from './sidebar';

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
