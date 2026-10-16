import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  coordinationGrants: vi.fn(),
  workspaces: vi.fn(),
  sessions: vi.fn(),
  grantSessionAccess: vi.fn(),
  revokeSessionAccess: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://owned-service' } }),
}));

import { SessionAccess } from './session-access';

let queryClient: QueryClient;

beforeEach(() => {
  vi.resetAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  repository.coordinationGrants.mockResolvedValue([]);
  repository.workspaces.mockResolvedValue([
    { id: 'workspace', name: 'Research', display_name: 'Research' },
  ]);
  repository.sessions.mockResolvedValue([
    { id: 'owner', title: 'Owning conversation' },
    { id: 'peer', title: 'Peer analysis' },
  ]);
  repository.grantSessionAccess.mockResolvedValue({ id: 'grant' });
  repository.revokeSessionAccess.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

function showAccess() {
  render(
    <QueryClientProvider client={queryClient}>
      <SessionAccess sessionId="owner" />
    </QueryClientProvider>,
  );
}

async function selectPeer() {
  await userEvent.click(screen.getByRole('button', { name: 'Access to other sessions' }));
  const select = await screen.findByRole('combobox', { name: 'Allow access to' });
  await screen.findByRole('option', { name: 'Peer analysis — Research' });
  await userEvent.selectOptions(select, 'peer');
  return select;
}

it('discloses access progressively without loading session data while closed', async () => {
  showAccess();
  expect(repository.coordinationGrants).not.toHaveBeenCalled();
  expect(repository.workspaces).not.toHaveBeenCalled();
  expect(screen.queryByRole('combobox')).toBeNull();
  await selectPeer();
  expect(repository.coordinationGrants).toHaveBeenCalledWith('owner', expect.any(AbortSignal));
  expect(screen.queryByRole('option', { name: 'Owning conversation — Research' })).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'Read assignments and results' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Observe progress and wait' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Send messages' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Pause, restart and cancel' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Include delegated children' })).not.toBeChecked();
});

it('grants read access without silently adding observe, messaging, control or descendants', async () => {
  showAccess();
  await selectPeer();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Observe progress and wait' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Send messages' }));
  await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  await waitFor(() => expect(repository.grantSessionAccess).toHaveBeenCalledTimes(1));
  expect(repository.grantSessionAccess).toHaveBeenCalledWith('owner', 'peer', ['read'], false);
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue(''));
});

it('requires an explicit control choice and explains descendant cancellation', async () => {
  showAccess();
  await selectPeer();
  expect(
    screen.queryByText('Control includes cancelling that agent’s descendant work.'),
  ).toBeNull();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Pause, restart and cancel' }));
  expect(
    screen.getByText('Control includes cancelling that agent’s descendant work.'),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Include delegated children' }));
  await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  await waitFor(() =>
    expect(repository.grantSessionAccess).toHaveBeenCalledWith(
      'owner',
      'peer',
      ['read', 'observe', 'message', 'control'],
      true,
    ),
  );
});

it('refuses an empty rights selection', async () => {
  showAccess();
  await selectPeer();
  for (const label of [
    'Read assignments and results',
    'Observe progress and wait',
    'Send messages',
  ]) {
    await userEvent.click(screen.getByRole('checkbox', { name: label }));
  }
  expect(screen.getByRole('button', { name: 'Grant access' })).toBeDisabled();
  expect(repository.grantSessionAccess).not.toHaveBeenCalled();
});

it('revokes the exact displayed grant and refreshes its human-controlled projection', async () => {
  repository.coordinationGrants
    .mockResolvedValueOnce([
      {
        id: 'active-grant',
        target_session: 'peer',
        rights: ['observe'],
        target_scope: 'session',
        revoked_at: null,
      },
      {
        id: 'old-grant',
        target_session: 'peer',
        rights: ['control'],
        target_scope: 'tree',
        revoked_at: '2026-10-15T00:00:00Z',
      },
    ])
    .mockResolvedValue([]);
  showAccess();
  await userEvent.click(screen.getByRole('button', { name: 'Access to other sessions' }));
  const list = await screen.findByRole('list', { name: 'Current session access' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText('Observe')).toBeVisible();
  expect(within(list).queryByText('Control')).toBeNull();
  await userEvent.click(within(list).getByRole('button', { name: 'Revoke' }));
  await waitFor(() =>
    expect(repository.revokeSessionAccess).toHaveBeenCalledWith('owner', 'active-grant'),
  );
  await waitFor(() =>
    expect(screen.queryByRole('list', { name: 'Current session access' })).toBeNull(),
  );
});

it('retains the chosen recipient and rights after a rejected grant', async () => {
  repository.grantSessionAccess.mockRejectedValue(new Error('Authenticated human grant required'));
  showAccess();
  const select = await selectPeer();
  await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Authenticated human grant required');
  expect(select).toHaveValue('peer');
  expect(screen.getByRole('checkbox', { name: 'Pause, restart and cancel' })).not.toBeChecked();
  expect(screen.queryByRole('list', { name: 'Current session access' })).toBeNull();
});
