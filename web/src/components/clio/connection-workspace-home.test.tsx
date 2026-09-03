import type { Session, Workspace } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionWorkspaceHome } from './connection-workspace-home';

afterEach(cleanup);

const workspace: Workspace = {
  id: 'ws_science',
  name: 'science',
  display_name: 'Science workspace',
  path: 'D:\\science',
  connection_id: 'local',
  pinned: false,
};

const session = (id: string, title: string, archived = false): Session => ({
  id,
  workspace_id: workspace.id,
  title,
  state: 'completed',
  created_at: '2026-09-02T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived,
});

describe('ConnectionWorkspaceHome', () => {
  it('exposes the connected service without selecting a session', async () => {
    const user = userEvent.setup();
    const onOpenSession = vi.fn();
    render(
      <MemoryRouter>
        <ConnectionWorkspaceHome
          endpoint="http://127.0.0.1:8788"
          label="Contained CLIO"
          onChangeConnection={vi.fn()}
          onOpenSession={onOpenSession}
          sessions={[
            session('sess_visible', 'Evidence review'),
            session('sess_archived', 'Archived review', true),
          ]}
          workspaces={[workspace]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Choose where to continue' })).toBeVisible();
    expect(screen.getByText('Science workspace')).toBeVisible();
    expect(screen.queryByText('Archived review')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Evidence review/u }));
    expect(onOpenSession).toHaveBeenCalledWith('ws_science', 'sess_visible');
  });

  it('offers service-level navigation from the home', () => {
    render(
      <MemoryRouter>
        <ConnectionWorkspaceHome
          endpoint="http://127.0.0.1:8788"
          onChangeConnection={vi.fn()}
          onOpenSession={vi.fn()}
          sessions={[]}
          workspaces={[workspace]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute('href', '/runs');
    expect(screen.getByRole('link', { name: 'Infrastructure' })).toHaveAttribute(
      'href',
      '/infrastructure',
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings/appearance',
    );
  });
});
