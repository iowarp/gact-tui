import { flowRunSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ taskFlow: vi.fn(), agentTask: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
vi.mock('@/hooks/use-session-agent', () => ({
  useSessionAgent: () => ({ agent: { data: undefined } }),
}));
// Pele draws in a browser; here the diagram's text alternative stands in for it.
vi.mock('./flow-diagram', () => ({
  FlowDiagram: ({ spec }: { spec: { kind: string; label: string; note?: string } }) => (
    <figure>
      <div aria-label={spec.label} data-kind={spec.kind} role="img" />
      {spec.note ? <figcaption>{spec.note}</figcaption> : null}
    </figure>
  ),
}));

import { FlowRunView } from './flow-run-view';
import { flowRunStatus } from './flow-run-presentation';

const planRun = flowRunSchema.parse({
  run_id: 'flowrun_1',
  flow: 'plan',
  status: 'running',
  depth: 1,
  root_handle: 'task_flow',
  entries: 4,
  view: {
    kind: 'plan',
    nodes: [
      { id: 'draft', target: 'self', after: [], status: 'completed', handle: 'task_draft' },
      {
        id: 'review',
        target: 'critic',
        after: ['draft'],
        status: 'running',
        handle: 'task_review',
      },
    ],
    added: 0,
    rounds: 1,
    awaiting_approval: [
      {
        id: 'polish',
        target: 'self',
        after: ['review'],
        by: 'critic',
        reason: 'tighten the wording',
      },
    ],
    editors: ['critic'],
    max_added: 2,
    max_rounds: 1,
    approve_edits: true,
  },
  calls: [],
  questions: [{ handle: 'task_question', question: 'Approve polish?' }],
  events: [{ event: 'node_proposed', node: 'polish' }],
  outcome: null,
});

function renderRun(onOpenSubagent = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FlowRunView handle="task_flow" onOpenSubagent={onOpenSubagent} sessionId="sess_1" />
    </QueryClientProvider>,
  );
  return onOpenSubagent;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FlowRunView', () => {
  it('draws the live plan with text statuses and the proposal awaiting approval', async () => {
    const user = userEvent.setup();
    repository.taskFlow.mockResolvedValue(planRun);
    repository.agentTask.mockResolvedValue({
      task_id: 'task_review',
      parent_session_id: 'sess_flow',
      child_session_id: 'sess_review',
      parent_turn_id: '',
      expert_id: '',
      run_index: 0,
      run_label: 'Critic',
      status: 'running',
      live_state: 'running',
      error_reason: '',
      created_at: '',
      updated_at: '',
      answer_excerpt: '',
    });
    const onOpen = renderRun();
    const nodes = await screen.findByRole('list', { name: 'Plan steps' });
    expect(within(nodes).getByText('Completed')).toBeVisible();
    expect(within(nodes).getByText('Running')).toBeVisible();
    expect(within(nodes).getByText('Awaiting approval')).toBeVisible();
    expect(within(nodes).getAllByText('this agent')).toHaveLength(2);
    await user.click(within(nodes).getByRole('button', { name: 'Show details of review' }));
    expect(within(nodes).getByText('Waits on:').parentElement).toHaveTextContent('Waits on: draft');
    expect(screen.getByText('A proposed step is waiting for your approval')).toBeVisible();
    expect(
      screen.getByText('polish', { selector: 'li > span.font-medium' }).parentElement,
    ).toHaveTextContent('polish runs self after review, proposed by critic: tighten the wording');
    expect(screen.getAllByText(/Added steps need your approval/u)[0]).toBeVisible();
    expect(
      screen.getByRole('img', {
        name: /The plan's 3 steps in order: draft, done; review, running/u,
      }),
    ).toHaveAttribute('data-kind', 'railroad');
    await user.click(within(nodes).getByRole('button', { name: 'Open step review' }));
    await waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith(
        expect.objectContaining({ child_session_id: 'sess_review' }),
        'canvas',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Answer the approval question' }));
    await waitFor(() => expect(repository.agentTask).toHaveBeenLastCalledWith('task_flow'));
  });

  it('shows a typed stall with its reason, step and message', async () => {
    repository.taskFlow.mockResolvedValue(
      flowRunSchema.parse({
        ...planRun,
        status: 'flow_stall',
        questions: [],
        outcome: {
          reason: 'flow_stall',
          message: "plan node 'review' failed and no editor repaired it",
          stall: 'node_failed',
          step: 'review',
          handle: 'task_review',
          observed: { error: { reason: 'call_failed' } },
        },
      }),
    );
    const user = userEvent.setup();
    renderRun();
    expect(await screen.findByText('The flow stalled at review:')).toBeVisible();
    expect(screen.getByText("plan node 'review' failed and no editor repaired it")).toBeVisible();
    await user.click(screen.getByText('Details'));
    expect(screen.getByText('node_failed')).toBeVisible();
    expect(screen.getByText('Stalled')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open the stalled step' })).toBeVisible();
  });

  it('shows a cancelled run as cancelled, not as a stall', async () => {
    repository.taskFlow.mockResolvedValue(
      flowRunSchema.parse({
        ...planRun,
        status: 'cancelled',
        questions: [],
        outcome: {
          reason: 'call_cancelled',
          message: "subagent 'researcher' ended cancelled",
          handle: 'task_review',
        },
      }),
    );
    renderRun();
    expect(await screen.findByText('The flow was cancelled:')).toBeVisible();
    expect(screen.getByText('Cancelled')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open the cancelled step' })).toBeVisible();
    expect(screen.queryByText('The flow stopped')).toBeNull();
  });

  it('lists the members and the synthesis of a council', async () => {
    repository.taskFlow.mockResolvedValue(
      flowRunSchema.parse({
        flow: 'council',
        status: 'completed',
        view: null,
        calls: [
          { invocation: 'a', kind: 'agent', target: 'self', handle: 'task_a', status: 'completed' },
          { invocation: 'b', kind: 'agent', target: 'self', handle: 'task_b', status: 'completed' },
        ],
        result: { answer: 'Python first; Julia for hot loops.' },
      }),
    );
    renderRun();
    expect(await screen.findByRole('heading', { name: 'Council run' })).toBeVisible();
    expect(screen.getAllByText('Completed')).toHaveLength(3);
    const members = screen.getByRole('list', { name: 'Flow members' });
    expect(within(members).getByText('Member 1')).toBeVisible();
    expect(within(members).getByText('Member 2')).toBeVisible();
    expect(screen.getByText('Synthesis')).toBeVisible();
    expect(screen.getByText('Python first; Julia for hot loops.')).toBeVisible();
    expect(
      screen.getByRole('img', {
        name: /Member 1, done; Member 2, done; then the synthesis, done/u,
      }),
    ).toBeVisible();
  });

  it('says when no flow run is recorded under the task', async () => {
    repository.taskFlow.mockResolvedValue(null);
    renderRun();
    expect(await screen.findByText(/No flow run is recorded for this task yet/u)).toBeVisible();
  });
});

describe('flow presentation helpers', () => {
  it('labels every run state in text', () => {
    expect(flowRunStatus({ status: 'running', outcome: null })).toEqual({
      value: 'running',
      label: 'Running',
    });
    expect(flowRunStatus({ status: 'flow_checkpoint_limit', outcome: null }).label).toBe(
      'Stopped: flow checkpoint limit',
    );
  });
});
