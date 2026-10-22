import { flowRunSchema, type ToolInvocation } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  taskFlow: vi.fn(),
  agentTask: vi.fn(),
  transcript: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
vi.mock('@/hooks/use-session-agent', () => ({
  useSessionAgent: () => ({ agent: { data: { resolution: { agent: { ref: 'clio/standard' } } } } }),
}));
vi.mock('./flow-diagram', () => ({
  FlowDiagram: ({ spec }: { spec: { kind: string; label: string } }) => (
    <div aria-label={spec.label} data-kind={spec.kind} role="img" />
  ),
}));

import '@/components/ai-elements/markdown';
import { ConversationTurn } from './conversation-turn';
import type { ConversationIteration } from './conversation-turn-model';
import { FlowRunCard } from './flow-run-card';
import { PresentationNavigation } from './presentation-navigation';

const run = flowRunSchema.parse({
  flow: 'plan',
  status: 'running',
  view: {
    kind: 'plan',
    nodes: [
      {
        id: 'clean',
        target: 'clio/standard',
        input: 'Clean the measurements and log every rule.',
        status: 'completed',
        handle: 'task_clean',
      },
      {
        id: 'north',
        target: 'clio/standard',
        after: ['clean'],
        status: 'running',
        handle: 'task_north',
      },
      { id: 'south', target: 'reviewer', after: ['clean'], status: 'pending' },
    ],
    editors: [],
  },
});

const planTool: ToolInvocation = {
  id: 'call_plan',
  session_id: 'sess_1',
  name: 'run_plan',
  state: 'succeeded',
  input: { plan: { nodes: [] }, task: 'Compare the sites.' },
  output: { accepted: true, handle: 'task_plan' },
};

function wrap(children: ReactNode, onOpenFlow = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PresentationNavigation.Provider value={{ onOpenFlow, onOpenSubagent: vi.fn() } as never}>
        {children}
      </PresentationNavigation.Provider>
    </QueryClientProvider>,
  );
  return onOpenFlow;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FlowRunCard', () => {
  it('shows the run in the conversation: track, step rows, and the plan the agent wrote', async () => {
    const user = userEvent.setup();
    repository.taskFlow.mockResolvedValue(run);
    repository.agentTask.mockImplementation(async (handle: string) => ({
      task_id: handle,
      created_at: '2026-10-22T00:00:00Z',
      updated_at: '2026-10-22T00:02:05Z',
    }));
    const onOpenFlow = wrap(
      <FlowRunCard
        flow={{
          flow: 'plan',
          label: 'Plan',
          handle: 'task_plan',
          args: { task: 'Compare the sites.' },
        }}
        sessionId="sess_1"
      />,
    );
    expect(await screen.findByText('Plan run')).toBeVisible();
    expect(await screen.findByText(/3 steps · 1 done, 1 running, 1 waiting/u)).toBeVisible();
    expect(screen.getByRole('img', { name: /The plan's 3 steps in order/u })).toHaveAttribute(
      'data-kind',
      'railroad',
    );
    const rows = screen.getByRole('list', { name: 'Plan steps' });
    expect(within(rows).getAllByText('this agent')).toHaveLength(2);
    expect(within(rows).getByText('reviewer')).toBeVisible();
    await waitFor(() => expect(within(rows).getByText('2 min 5 s')).toBeVisible());

    await user.click(within(rows).getByRole('button', { name: 'Show details of clean' }));
    expect(within(rows).getByText('Clean the measurements and log every rule.')).toBeVisible();

    await user.click(screen.getByText('Show the plan'));
    expect(screen.getByText('Compare the sites.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByText(/"task": "Compare the sites."/u)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Open the plan run in the side panel/u }));
    expect(onOpenFlow).toHaveBeenCalledWith('task_plan', 'Plan run');
  });

  it('stands as its own boundary in the conversation, once', async () => {
    repository.taskFlow.mockResolvedValue(run);
    repository.agentTask.mockResolvedValue({ task_id: 'x', created_at: '', updated_at: '' });
    const iteration: ConversationIteration = {
      id: 'assistant_1:iteration:0',
      index: 0,
      agentId: 'main',
      thinking: [],
      nextThoughts: ['Start the plan.'],
      activity: [{ kind: 'tool', id: 'call_plan', tool: planTool }],
      tools: [planTool],
      tasks: [],
      terminal: false,
      interrupted: false,
      streaming: false,
      summary: 'Start the plan.',
    };
    wrap(
      <ConversationTurn
        iterations={[iteration]}
        messageSessionId="sess_1"
        mode="chain"
        subagents={{}}
      />,
    );
    expect(await screen.findByText('Plan run')).toBeVisible();
    expect(screen.getAllByText('Plan run')).toHaveLength(1);
    expect(repository.taskFlow).toHaveBeenCalledWith('sess_1', 'task_plan', expect.anything());
  });
});
