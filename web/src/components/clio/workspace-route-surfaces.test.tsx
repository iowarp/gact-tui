import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceStatusStrip } from './workspace-route-surfaces';

describe('WorkspaceStatusStrip', () => {
  it('keeps transport checkpoints out of the healthy primary status', () => {
    render(<WorkspaceStatusStrip activeWorkCount={0} cursor="checkpoint-1849" stream="live" />);

    expect(screen.getByText('No active work')).toBeVisible();
    expect(screen.getByText('Tokens: Unavailable')).toBeVisible();
    expect(screen.getByText('Cost: Unavailable')).toBeVisible();
    expect(screen.queryByText(/cursor|checkpoint/u)).not.toBeInTheDocument();
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
