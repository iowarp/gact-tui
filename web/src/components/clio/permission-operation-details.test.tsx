import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';
import { PermissionOperationDetails } from './permission-operation-details';

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

const permission = (mode: string): PendingInteraction => ({
  id: 'connect-observations',
  kind: 'permission',
  status: 'pending',
  title: 'Connect Alta observations',
  owner_session_id: 's',
  attended_session_id: 's',
  source: { protocol: 'native', tool_name: 'connected_data_connect' },
  created_at: '2026-10-18T12:00:00Z',
  payload: {
    tool_call: {
      tool_name: 'connected_data_connect',
      input: {
        provider: 'ndp',
        label: 'Alta observations',
        endpoint: 'Research catalog',
        mode,
        resources: ['observations.csv', 'README.txt'],
      },
    },
  },
});

it('explains the source, access mode and selected resources without a protocol action name', () => {
  render(<PermissionOperationDetails interaction={permission('read_only')} />);
  expect(screen.getByText('Connect source')).toBeVisible();
  expect(screen.getByText('Alta observations')).toBeVisible();
  expect(screen.getByText('National Data Platform')).toBeVisible();
  expect(screen.getByText('Research catalog')).toBeVisible();
  expect(screen.getByText('Read only')).toBeVisible();
  expect(screen.getByText('observations.csv, README.txt')).toBeVisible();
  expect(screen.queryByText('connected_data_connect')).not.toBeInTheDocument();
});

it.each([
  ['working_copy', 'Editable copy, publish changes after review'],
  ['write_enabled', 'Read and write originals'],
])('describes %s access without implying read-only access', (mode, description) => {
  render(<PermissionOperationDetails interaction={permission(mode)} />);
  expect(screen.getByText(description)).toBeVisible();
  expect(screen.queryByText('Read only')).not.toBeInTheDocument();
});

it('pages multiple source approvals and removes the pager for the last request', async () => {
  const user = userEvent.setup();
  const first = permission('read_only');
  const second = { ...permission('read_only'), id: 'second', title: 'Connect second dataset' };
  const props = { viewedSessionId: 's', onResponse: vi.fn(async () => undefined) };
  const { rerender } = render(
    <ClioPendingInteractions {...props} interactions={[first, second]} />,
  );
  expect(screen.getByText('1 / 2')).toBeVisible();
  expect(screen.getByText('Connect Alta observations')).toBeVisible();
  // Other pages stay mounted to preserve each request's draft and selected duration.
  expect(screen.getByText('Connect second dataset')).not.toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Allow once' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Next request' }));
  expect(screen.getByText('2 / 2')).toBeVisible();
  expect(screen.getByText('Connect second dataset')).toBeVisible();
  expect(screen.getByText('Connect Alta observations')).not.toBeVisible();
  rerender(<ClioPendingInteractions {...props} interactions={[second]} />);
  expect(screen.queryByRole('navigation', { name: 'Pending requests' })).not.toBeInTheDocument();
  expect(screen.getByText('Connect second dataset')).toBeVisible();
});

it('shows a readable title for retained requests with the old generic summary', () => {
  render(
    <ClioPendingInteractions
      viewedSessionId="s"
      onResponse={vi.fn(async () => undefined)}
      interactions={[
        {
          ...permission('read_only'),
          title: 'destructive tool call: connected_data_connect',
        },
      ]}
    />,
  );
  expect(screen.getByText('Connect Alta observations')).toBeVisible();
  expect(
    screen.queryByText('destructive tool call: connected_data_connect'),
  ).not.toBeInTheDocument();
});
