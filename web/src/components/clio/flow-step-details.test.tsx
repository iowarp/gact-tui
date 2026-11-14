import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  taskInput: vi.fn(),
  agentTask: vi.fn(),
  transcript: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('./node-folder', () => ({ StepFolder: () => null }));

import { FlowPickDetails } from './flow-step-details';
import type { FlowStep } from './flow-run-presentation';

const researcher: FlowStep = {
  id: 'research:d1',
  target: 'researcher',
  targetLabel: 'researcher',
  input: undefined,
  after: [],
  status: { value: 'completed', label: 'Returned', word: 'done', tone: 'done' },
  handle: 'task_researcher',
  kind: 'agent',
  label: 'HDF5 registry filter IDs',
  attempts: 1,
  asked: 'Which HDF5 filter IDs are registered for ZFP and SZ3?',
};

function renderDetails(step: FlowStep, onOpenHandle = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FlowPickDetails
        elapsed={new Map()}
        onClose={() => undefined}
        onOpenHandle={onOpenHandle}
        pick={{ kind: 'step', step }}
        sessionId="sess_parent"
      />
    </QueryClientProvider>,
  );
  return onOpenHandle;
}

describe('FlowPickDetails', () => {
  beforeEach(() => {
    repository.taskInput.mockResolvedValue({
      handle: 'task_researcher',
      label: 'HDF5 registry filter IDs',
      description: 'Direction: HDF5 registry filter IDs\nFind the registered IDs.',
      description_missing: false,
    });
    repository.agentTask.mockResolvedValue({ child_session_id: 'sess_researcher' });
    repository.transcript.mockResolvedValue({
      messages: [{ role: 'assistant', blocks: [{ type: 'text', text: 'ZFP is 32013.' }] }],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a flow step's input, its answer and a way to its conversation", async () => {
    const onOpen = renderDetails(researcher);
    const details = screen.getByRole('region', { name: 'HDF5 registry filter IDs: Returned' });
    expect(within(details).getByText('Input to researcher')).toBeVisible();
    expect(await within(details).findByText(/Find the registered IDs\./u)).toBeVisible();
    expect(repository.taskInput).toHaveBeenCalledWith(
      'sess_parent',
      'task_researcher',
      expect.anything(),
    );
    expect(within(details).getByText('Answer from researcher')).toBeVisible();
    expect(await within(details).findByText('ZFP is 32013.')).toBeVisible();
    expect(within(details).getByText('Agent:')).toBeVisible();
    await userEvent.click(
      within(details).getByRole('button', {
        name: "See HDF5 registry filter IDs's conversation",
      }),
    );
    expect(onOpen).toHaveBeenCalledWith('task_researcher');
  });

  it('says where the input is when the task did not record it', async () => {
    repository.taskInput.mockResolvedValue(null);
    renderDetails(researcher);
    expect(
      await screen.findByText('Not recorded here. See conversation shows what it was given.'),
    ).toBeVisible();
  });

  it('does not read an input for a step that has not started', () => {
    renderDetails({ ...researcher, handle: undefined });
    expect(screen.getAllByText('Not started yet.')[0]).toBeVisible();
    expect(repository.taskInput).not.toHaveBeenCalled();
  });
});
