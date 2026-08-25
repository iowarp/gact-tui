import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceStatusStrip } from './workspace-route-surfaces';

afterEach(cleanup);

describe('WorkspaceStatusStrip', () => {
  it('keeps transport checkpoints out of the healthy primary status', () => {
    render(<WorkspaceStatusStrip activeWorkCount={0} cursor="checkpoint-1849" stream="live" />);

    expect(screen.getByText('No active work')).toBeVisible();
    expect(screen.getByText('Tokens: Unavailable')).toBeVisible();
    expect(screen.getByText('Cost: Unavailable')).toBeVisible();
    expect(screen.queryByText(/cursor|checkpoint/u)).not.toBeInTheDocument();
  });

  it('opens a compact menu with authoritative workspace and service versions', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WorkspaceStatusStrip
          activeWorkCount={0}
          a2uiVersions={['0.9.1']}
          gactVersions={['0.3', '0.2']}
          service={{ name: 'clio-agent', version: '0.9.1.1' }}
          stream="live"
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Product versions and updates' }));

    expect(screen.getByText('Product versions')).toBeVisible();
    expect(screen.getByText('0.9.1.1')).toBeVisible();
    expect(screen.getByText('0.3')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Update options' })).toHaveAttribute(
      'href',
      '/settings/desktop',
    );
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
