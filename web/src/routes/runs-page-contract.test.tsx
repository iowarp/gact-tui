import type { Session, TaskSnapshot, Workspace } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  queryTasks: vi.fn(),
  allSessions: vi.fn(),
  workspaces: vi.fn(),
  transcript: vi.fn(),
  cancelTasks: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:8790' } }),
}));
import { RunsPage } from './runs-page';
import { sessionReads } from '@/test/session-reads';

const description =
  'A long original assignment with retained exact meaning and enough detail to require progressive disclosure.';
function task(handle: string, kind: TaskSnapshot['kind'], session = 'session-one'): TaskSnapshot {
  return {
    handle,
    kind,
    owner: { human_id: 'human', session_id: session, assignment_id: handle, parent_handle: null },
    label: kind === 'Subagent' ? 'Analyze dataset' : 'Convert images',
    description,
    description_reference: null,
    description_missing: false,
    tool: 'builtin',
    invocation_id: handle,
    status: 'active',
    raw_status: 'working',
    activity: 'executing',
    progress: { message: 'Working', completed: 2, total: 10, unit: 'files', output: null },
    supported_actions: ['observe', 'cancel'],
    cancellation_requested_at: null,
    terminal_at: null,
    connection_freshness: 'fresh',
    settlement: 'unknown',
    recording: 'confirmed',
    result: null,
    details: null,
    backend: null,
    created_at: '2026-10-15T01:00:00Z',
    updated_at: '2026-10-15T01:00:10Z',
  };
}

beforeEach(() => {
  repository.allSessions.mockResolvedValue(
    ['session-one', 'session-two'].map(
      (id) =>
        ({
          id,
          workspace_id: 'workspace',
          title: id,
          state: 'yielded',
          created_at: '2026-10-15T01:00:00Z',
          updated_at: '2026-10-15T01:00:00Z',
          mode: 'edit',
          edit_mode: 'diff',
          routing_mode: 'auto',
          approval_mode: 'ask',
          pinned: false,
          archived: false,
        }) satisfies Session,
    ),
  );
  repository.workspaces.mockResolvedValue([
    {
      id: 'workspace',
      name: 'Review',
      display_name: 'Review',
      path: '/workspace',
      connection_id: 'local',
      pinned: false,
    } satisfies Workspace,
  ]);
  repository.cancelTasks.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RunsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('discloses a lost-visibility issue once in run details rather than repeating it as progress', async () => {
  const issue = 'Server returned an error response';
  const lost = task('task-lost', 'MCP');
  lost.status = 'task_state_uncertain';
  lost.connection_freshness = 'lost';
  lost.progress = { message: issue, completed: null, total: null, unit: '', output: null };
  repository.queryTasks.mockResolvedValue({ tasks: [lost], total: 1, cursor: null, revision: 1 });
  show();
  expect(await screen.findByText('Needs inspection')).toBeVisible();
  expect(screen.queryByText(issue, { exact: true })).toBeNull();
  await userEvent.click(screen.getByText('Details'));
  expect(screen.getAllByText(`Reported issue: ${issue}`)).toHaveLength(1);
  expect(screen.getByText(`Reported issue: ${issue}`)).toBeVisible();
});

it.each([
  [
    'structured',
    JSON.stringify({ last_error: 'Connection lost', context: 'original backend identity' }),
  ],
  [
    'long',
    'Transport visibility was lost. ' +
      'The accepted operation may still be running. '.repeat(8) +
      'End of original diagnostic.',
  ],
])(
  'keeps the full %s diagnostic in details without repeating it as progress',
  async (_kind, issue) => {
    const lost = task('task-lost-details', 'MCP');
    lost.status = 'task_state_uncertain';
    lost.connection_freshness = 'lost';
    lost.progress = { message: issue, completed: null, total: null, unit: '', output: null };
    repository.queryTasks.mockResolvedValue({ tasks: [lost], total: 1, cursor: null, revision: 1 });
    show();
    expect(await screen.findByText('Needs inspection')).toBeVisible();
    expect(screen.queryByText(issue, { exact: true })).toBeNull();
    await userEvent.click(screen.getByText('Details'));
    expect(screen.getAllByText(`Reported issue: ${issue}`)).toHaveLength(1);
    expect(screen.getByText(`Reported issue: ${issue}`)).toBeVisible();
  },
);

it('loads explicit task pages across sessions and keeps original handles navigable', async () => {
  repository.queryTasks.mockImplementation(async ({ cursor }: { cursor?: string }) =>
    cursor
      ? {
          tasks: [task('task-two', 'Subagent', 'session-two')],
          total: 2,
          cursor: null,
          revision: 2,
        }
      : { tasks: [task('task-one', 'Shell')], total: 2, cursor: 'next-page', revision: 1 },
  );
  show();
  expect(
    await screen.findByText('Showing 1 of 2 tasks. Search covers loaded results.'),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Load more tasks' }));
  expect(
    await screen.findByText('Showing 2 of 2 tasks. Search covers loaded results.'),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: /Analyze dataset/u })).toHaveAttribute(
    'href',
    '/workspaces/workspace/sessions/session-two',
  );
  expect(repository.queryTasks.mock.calls.some(([options]) => options.cursor === 'next-page')).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Load more tasks' })).not.toBeInTheDocument();
});

it('continues an empty sparse page and labels an unknown total without inventing zero', async () => {
  repository.queryTasks.mockImplementation(async ({ cursor }: { cursor?: string }) =>
    cursor
      ? { tasks: [task('task-later', 'Shell')], total: null, cursor: null, revision: 2 }
      : { tasks: [], total: null, cursor: 'sparse-continuation', revision: 1 },
  );
  show();
  expect(await screen.findByText(/0 tasks loaded/)).toBeVisible();
  expect(screen.queryByText(/Showing .* of 0 tasks/)).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Load more tasks' }));
  expect(await screen.findByText(/1 tasks loaded/)).toBeVisible();
  expect(repository.queryTasks).toHaveBeenCalledWith(
    expect.objectContaining({ cursor: 'sparse-continuation' }),
    expect.anything(),
  );
  expect(screen.queryByRole('button', { name: 'Load more tasks' })).not.toBeInTheDocument();
});

it('discloses exact assignment and backend details only when opened', async () => {
  repository.queryTasks.mockResolvedValue({
    tasks: [task('task-one', 'Shell')],
    total: 1,
    cursor: null,
    revision: 1,
  });
  show();
  await screen.findByRole('link', { name: /Convert images/u });
  expect(screen.getByText(description)).not.toBeVisible();
  await userEvent.click(screen.getByText('Details'));
  expect(screen.getByText(description)).toBeVisible();
  expect(screen.getByText('task-one')).toBeVisible();
  expect(screen.getByText('Backend: working')).toBeVisible();
});

it('confirms subtree cancellation and prevents duplicate requests while settlement is pending', async () => {
  repository.queryTasks.mockResolvedValue({
    tasks: [task('child-handle', 'Subagent')],
    total: 1,
    cursor: null,
    revision: 1,
  });
  show();
  await userEvent.click(
    await screen.findByRole('button', { name: `Cancel Subagent: ${description}` }),
  );
  const dialog = screen.getByRole('alertdialog');
  expect(
    within(dialog).getByText(/descendant agents, downloads and shell processes/u),
  ).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel task' }));
  await waitFor(() =>
    expect(repository.cancelTasks).toHaveBeenCalledWith('session-one', ['child-handle']),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: `Cancel Subagent: ${description}` })).toBeDisabled();
  expect(repository.cancelTasks).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Detach|Dismiss from explorer/u)).not.toBeInTheDocument();
});

// The bounded session reads, answered from this test's session list.
Object.assign(
  repository,
  sessionReads(() => repository.allSessions()),
);
