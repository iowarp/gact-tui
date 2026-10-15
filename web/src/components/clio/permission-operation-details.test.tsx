import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';

afterEach(cleanup);

const request: PendingInteraction = {
  id: 'permission:folder-review',
  kind: 'permission',
  owner_session_id: 'session1',
  attended_session_id: 'session1',
  status: 'pending',
  title: 'Allow access to these folders?',
  requires_human_response: true,
  source: { protocol: 'native', tool_name: 'shell_bash' },
  created_at: '2026-10-15T12:00:00Z',
  actions: ['deny', 'allow_workspace'],
  payload: {
    permission_id: 'folder-review',
    tool_call: { tool_name: 'shell_bash', input: { command: 'Move-Item source destination' } },
    access: {
      folders: ['C:\\Users\\Alice\\Downloads', 'D:\\Research\\Results'],
      computer: 'Research PC',
      workspace_id: 'workspace1',
      operation: 'shell_bash',
      command: 'Move-Item source destination',
      paths: [
        'C:\\Users\\Alice\\Downloads\\measurements.csv',
        'D:\\Research\\Results\\measurements.csv',
      ],
      cwd: 'D:\\Research',
      reason: 'Move the measurements you selected into the results folder.',
      access: 'read_write',
      scope: 'workspace',
    },
  },
};

it('shows command, computer, folders, reason and real duration before technical details', async () => {
  const respond = vi.fn();
  render(
    <ClioPendingInteractions
      interactions={[request]}
      viewedSessionId="session1"
      onResponse={respond}
    />,
  );
  expect(screen.getByText('Move-Item source destination')).toBeVisible();
  expect(screen.getByText('Research PC')).toBeVisible();
  expect(screen.getByText('C:\\Users\\Alice\\Downloads')).toBeVisible();
  expect(screen.getByText('D:\\Research\\Results')).toBeVisible();
  expect(
    screen.getByText('Move the measurements you selected into the results folder.'),
  ).toBeVisible();
  expect(screen.getByText(/including after restart/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Allow once' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Allow for session' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Allow for workspace' }));
  expect(respond).toHaveBeenCalledWith(request, { action: 'allow_workspace' });
});

it('declines the original operation and retains an actionable response error', async () => {
  const respond = vi.fn().mockRejectedValueOnce(new Error('Could not save permission. Try again.'));
  render(
    <ClioPendingInteractions
      interactions={[request]}
      viewedSessionId="session1"
      onResponse={respond}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
  expect(await screen.findByText('Could not save permission. Try again.')).toBeVisible();
  expect(respond).toHaveBeenCalledWith(request, { action: 'deny' });
});
