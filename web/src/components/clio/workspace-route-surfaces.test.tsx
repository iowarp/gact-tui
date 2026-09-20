import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { WorkspaceHydrating, WorkspaceStatusStrip } from './workspace-route-surfaces';

vi.mock('./navigation-version-status', () => ({
  SystemVersionStatus: () => <button type="button">System version</button>,
}));

afterEach(cleanup);

describe('WorkspaceStatusStrip', () => {
  it('keeps transport checkpoints out of the healthy primary status', () => {
    render(<WorkspaceStatusStrip activeWorkCount={0} cursor="checkpoint-1849" stream="live" />);

    expect(screen.getByText('No active work')).toBeVisible();
    expect(screen.getByText('Up to date')).toBeVisible();
    expect(screen.getByText('Tokens: Unavailable')).toBeVisible();
    expect(screen.getByText('Cost: Unavailable')).toBeVisible();
    expect(screen.queryByText(/cursor|checkpoint/u)).not.toBeInTheDocument();
  });

  it('places the single system-version control in the bottom status strip', () => {
    render(<WorkspaceStatusStrip activeWorkCount={0} stream="live" />);

    expect(screen.getByRole('button', { name: 'System version' })).toBeVisible();
  });

  it('describes recovery in user terms while retaining the checkpoint as metadata', () => {
    render(
      <WorkspaceStatusStrip activeWorkCount={2} cursor="checkpoint-1849" stream="reconnecting" />,
    );

    expect(screen.getByText('Resuming updates')).toHaveAttribute(
      'title',
      'Recovery checkpoint point-1849',
    );
    expect(screen.getByText('2 active items')).toBeVisible();
  });
});

describe('WorkspaceHydrating', () => {
  it('keeps loading state inside the conversation pane', () => {
    render(<WorkspaceHydrating />);

    const surface = screen.getByRole('region', { name: 'Conversation loading' });
    expect(surface).toBeVisible();
    expect(surface).toHaveClass('h-full', 'min-h-0');
    expect(surface).not.toHaveClass('min-h-dvh');
    expect(screen.getByText(/messages will appear as they arrive/iu)).toBeVisible();
  });
});
