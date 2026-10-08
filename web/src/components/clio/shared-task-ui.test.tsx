import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { AsyncProcess, ConnectedSourceState } from '@clio/core/v3';
import { connectedSourceStateSchema } from '@clio/core/v3';
import { connectionScope } from '@/lib/connection-scope';

const fixtures = vi.hoisted(() => ({
  settings: { endpoint: 'http://owned-service', token: '', location: '' },
  repository: { sourceOperations: vi.fn(), attachSourceFolder: vi.fn(), beginSourceDraft: vi.fn() },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: fixtures.settings }),
}));
import { AsyncTaskList } from './async-task-list';
import { SourceDownloadAttachment } from './source-download-attachment';
import { RunActions } from './run-actions';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('keeps advertised subtree cancellation available after the subagent itself completes', async () => {
  const user = userEvent.setup();
  const cancel = vi.fn();
  render(
    <RunActions
      onCancel={cancel}
      onDetach={vi.fn()}
      onDismiss={vi.fn()}
      pending={false}
      row={{
        handleId: 'task_completed_parent',
        taskId: 'completed-parent',
        label: 'Completed parent',
        state: 'completed',
        reportedStatus: 'completed',
        source: 'agent_task',
        host: 'local',
        placement: 'local',
        workspaceLabel: 'Owned',
        workspaceLabelFields: { name: 'Owned', qualifiers: [] },
        updatedAt: '2026-10-08T10:00:00Z',
        detached: false,
        taskKind: 'Subagent',
        assignment: 'Own descendant work',
        cancellable: true,
      }}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Cancel Subagent: Own descendant work' }));
  expect(cancel).toHaveBeenCalledTimes(1);
});

const operation = {
  id: 'index-op',
  source_id: 'owned-source',
  kind: 'indexing',
  state: 'running',
  bytes_done: 0,
  bytes_total: 0,
  entries_done: 32,
  task_handle: 'task_index',
  native_job_id: null,
  cancel_requested: false,
  error: null,
  applied_paths: [],
  created_at: '2026-10-08T10:00:00Z',
  updated_at: '2026-10-08T10:00:01Z',
};

it('keeps a linked folder pending until its exact indexing operation completes', async () => {
  const source = connectedSourceStateSchema.parse({
    id: 'owned-source',
    label: 'Owned folder',
    provider: 'local',
    root: '/owned',
    mode: 'read_only',
    owner: { clio_id: 'test', host_id: 'local' },
    connected: true,
    authenticated: true,
    configuration: {},
    materialization: 'not_materialized',
    local_path: null,
    revision: null,
    capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
    indexing_operation: operation,
  }) as ConnectedSourceState;
  expect(source.indexing_operation?.task_handle).toBe('task_index');
  fixtures.repository.sourceOperations.mockResolvedValue([operation]);
  fixtures.repository.attachSourceFolder.mockResolvedValue({
    id: 'manifest-resource',
    revision: 1,
    detected_mime: 'application/json',
  });
  const selected = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SourceDownloadAttachment
        workspaceId="workspace"
        source={source}
        operationId="index-op"
        selection={{ path: '', kind: 'folder', draftId: 'lease', linked: true }}
        onSelect={selected}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Indexing folder… 32 entries')).toBeVisible();
  expect(fixtures.repository.attachSourceFolder).not.toHaveBeenCalled();
  const key = [
    'connected-storage',
    connectionScope(fixtures.settings),
    'workspace',
    'owned-source',
    'operations',
  ];
  client.setQueryData(key, [{ ...operation, state: 'completed', entries_done: 71 }]);
  await waitFor(() => expect(selected).toHaveBeenCalledTimes(1));
  expect(fixtures.repository.attachSourceFolder).toHaveBeenCalledWith(
    'workspace',
    'owned-source',
    true,
    '',
    'lease',
  );
  expect(selected.mock.calls[0][0].navigation.source_linked).toBe('true');
  client.setQueryData(key, [{ ...operation, state: 'completed', entries_done: 71 }]);
  await waitFor(() => expect(fixtures.repository.attachSourceFolder).toHaveBeenCalledTimes(1));
  client.clear();
});

it('confirms subagent subtree cancellation and suppresses duplicate pending requests', async () => {
  const task: AsyncProcess = {
    kind: 'agent',
    task_kind: 'Subagent',
    id: 'child',
    handle: 'task_child',
    title: 'Child',
    description: 'Inspect owned files',
    live_state: 'running',
    effective_status: 'running',
    status: 'running',
    supported_actions: ['cancel'],
    metadata: {},
  };
  let finish!: () => void;
  const cancel = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<AsyncTaskList processes={[task]} onCancelTask={cancel} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Cancel Subagent: Inspect owned files' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'all descendant agents, downloads and shell processes',
  );
  expect(cancel).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep running' }));
  expect(cancel).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel Subagent: Inspect owned files' }));
  await user.click(screen.getByRole('button', { name: 'Cancel task' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Cancellation requested')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Cancel Subagent: Inspect owned files' }),
  ).toBeDisabled();
  finish();
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  view.rerender(
    <AsyncTaskList
      processes={[
        {
          ...task,
          live_state: 'cancelled',
          effective_status: 'cancelled',
          supported_actions: ['observe', 'wait', 'result'],
        },
      ]}
      onCancelTask={cancel}
    />,
  );
  expect(screen.getByText('cancelled')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Cancel Subagent: Inspect owned files' })).toBeNull();
});
