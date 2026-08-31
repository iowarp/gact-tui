import type { WorkspaceResource } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceResourceBrowser } from './workspace-resource-browser';

vi.mock('./workspace-resource-view', () => ({
  WorkspaceResourceView: ({ resource }: { resource: WorkspaceResource }) => (
    <div>Previewing {resource.name}</div>
  ),
}));

afterEach(cleanup);

const resource: WorkspaceResource = {
  id: 'resource_1',
  workspace_id: 'workspace_1',
  client_upload_id: 'upload_1',
  revision: 1,
  name: 'stations.csv',
  claimed_mime: 'text/csv',
  detected_mime: 'text/csv',
  detection_source: 'magic',
  declared_size: 2048,
  received_size: 2048,
  sha256: 'abc',
  state: 'ready',
  failure: '',
  created_at: '2026-08-31T12:00:00Z',
  updated_at: '2026-08-31T12:00:01Z',
  completed_at: '2026-08-31T12:00:01Z',
  mime_mismatch: false,
};

describe('WorkspaceResourceBrowser', () => {
  it('replaces a narrow resource list on ordinary activation and pins on Shift-click', async () => {
    const user = userEvent.setup();
    const onOpenResource = vi.fn();
    render(
      <WorkspaceResourceBrowser
        onOpenResource={onOpenResource}
        resources={[resource]}
        workspaceId="workspace_1"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open stations.csv' }));
    expect(onOpenResource).toHaveBeenLastCalledWith(resource);

    fireEvent.click(screen.getByRole('button', { name: 'Open stations.csv' }), {
      shiftKey: true,
    });
    expect(onOpenResource).toHaveBeenCalledTimes(2);
  });

  it('keeps the list beside a transient preview when the canvas has room', async () => {
    const user = userEvent.setup();
    const onOpenResource = vi.fn();
    render(
      <WorkspaceResourceBrowser
        defaultSplit
        onOpenResource={onOpenResource}
        resources={[resource]}
        workspaceId="workspace_1"
      />,
    );

    expect(await screen.findByText('Previewing stations.csv')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open stations.csv' }));
    expect(onOpenResource).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Pin stations.csv as a canvas tab' }));
    expect(onOpenResource).toHaveBeenCalledWith(resource);
  });

  it('uses an honest empty state when no uploads exist', () => {
    render(
      <WorkspaceResourceBrowser
        onOpenResource={vi.fn()}
        resources={[]}
        workspaceId="workspace_1"
      />,
    );
    expect(screen.getByText('No workspace resources')).toBeVisible();
  });
});
