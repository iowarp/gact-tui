import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PresentationLink } from './presentation-link';
import { PresentationNavigation } from './presentation-navigation';

describe('presentation navigation', () => {
  it('opens a saved document through the existing workspace file viewer', () => {
    const open = vi.fn();
    render(
      <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, onOpenFile: open }}>
        <PresentationLink
          block={{
            id: 'saved',
            type: 'link',
            target: 'resource',
            uri: 'D:/workspace/report.md',
            label: 'Saved Markdown',
          }}
        />
      </PresentationNavigation.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Saved Markdown' }));
    expect(open).toHaveBeenCalledWith('D:/workspace/report.md');
  });
  it('does not turn an untrusted script URI into a clickable link', () => {
    render(
      <PresentationLink
        block={{
          id: 'unsafe',
          type: 'link',
          target: 'url',
          uri: 'javascript:alert(1)',
          label: 'Unsafe',
        }}
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Unsafe/)).toBeInTheDocument();
  });
});
