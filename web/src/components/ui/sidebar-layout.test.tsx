import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SidebarContent, SidebarFooter, SidebarHeader } from './sidebar';

afterEach(cleanup);

describe('sidebar vertical layout', () => {
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
