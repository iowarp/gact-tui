import type { WorkspaceResource } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';
import { PresentationNavigation } from './presentation-navigation';

afterEach(cleanup);

it('opens a declared file directly from a collapsed activity row without nested controls', async () => {
  const user = userEvent.setup();
  const openFile = vi.fn();
  const { container } = render(
    <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}>
      <ClioToolInvocation
        compact
        tool={{
          id: 'read',
          session_id: 's',
          name: 'fs_read_file',
          state: 'succeeded',
          presentation: {
            action: 'Read',
            subject: 'file',
            summary: '12 bytes',
            blocks: [
              {
                id: 'file',
                type: 'link',
                target: 'file',
                uri: 'D:/data/stations.csv',
                label: 'stations.csv',
              },
            ],
          },
        }}
      />
    </PresentationNavigation.Provider>,
  );
  const disclosure = screen.getByRole('button', { name: 'Show result for Read' });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(disclosure).toBeDisabled();
  await user.tab();
  expect(screen.getByRole('button', { name: 'stations.csv' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(openFile).toHaveBeenCalledWith('D:/data/stations.csv');
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(container.querySelector('button button')).toBeNull();
});

it('opens the registered linked resource by identity directly from the collapsed row', async () => {
  const resource: WorkspaceResource = {
    id: 'res_snow',
    workspace_id: 'w',
    client_upload_id: 'source',
    revision: 1,
    name: 'snow.csv',
    claimed_mime: 'text/csv',
    detected_mime: 'text/csv',
    detection_source: 'test',
    declared_size: 12,
    received_size: 12,
    sha256: 'a'.repeat(64),
    state: 'ready',
    failure: '',
    created_at: '',
    updated_at: '',
    completed_at: '',
    mime_mismatch: false,
  };
  const openResource = vi.fn();
  render(
    <PresentationNavigation.Provider
      value={{
        artifacts: {},
        subagents: {},
        resources: { [resource.id]: resource },
        onOpenResource: openResource,
      }}
    >
      <ClioToolInvocation
        compact
        tool={{
          id: 'read',
          session_id: 's',
          name: 'connected_data_open',
          state: 'succeeded',
          presentation: {
            action: 'Open linked data',
            subject: 'resource',
            summary: '',
            blocks: [
              {
                id: 'resource',
                type: 'link',
                target: 'resource',
                uri: resource.id,
                label: resource.name,
              },
            ],
          },
        }}
      />
    </PresentationNavigation.Provider>,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'snow.csv' }));
  expect(openResource).toHaveBeenCalledWith(resource);
});

it('does not offer an open action for an unavailable reference', () => {
  render(
    <ClioToolInvocation
      compact
      tool={{
        id: 'read',
        session_id: 's',
        name: 'connected_data_open',
        state: 'succeeded',
        presentation: {
          action: 'Open linked data',
          subject: 'resource',
          summary: '',
          blocks: [
            {
              id: 'resource',
              type: 'link',
              target: 'resource',
              uri: 'res_missing',
              label: 'missing.csv',
            },
          ],
        },
      }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'missing.csv' })).not.toBeInTheDocument();
});
