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
// Pele draws in a browser; here the diagram's text alternative and one button per node stand in.
vi.mock('./flow-diagram', () => ({
  FlowDiagram: ({
    spec,
    onSelect,
  }: {
    spec: {
      kind: string;
      label: string;
      note?: string;
      railroad?: { marks: { key: string; title: string }[] };
    };
    onSelect?: (key: string) => void;
  }) => (
    <figure>
      <div aria-label={spec.label} data-kind={spec.kind} role="img" />
      {spec.railroad?.marks.map((mark) => (
        <button
          aria-label={mark.title}
          key={mark.key}
          onClick={() => onSelect?.(mark.key)}
          type="button"
        />
      ))}
      {spec.note ? <figcaption>{spec.note}</figcaption> : null}
    </figure>
  ),
}));

import '@/components/ai-elements/markdown';
import { ConversationTurn } from './conversation-turn';
import type { ConversationIteration } from './conversation-turn-model';
import { FlowRunCard } from './flow-run-card';
import { PresentationNavigation } from './presentation-navigation';

const run = flowRunSchema.parse({
  flow: 'workflow',
  status: 'running',
  view: {
    kind: 'workflow',
    steps: [
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

const workflowTool: ToolInvocation = {
  id: 'call_workflow',
  session_id: 'sess_1',
  name: 'run_workflow',
  state: 'succeeded',
  input: { workflow: { steps: [] }, task: 'Compare the sites.' },
  output: { accepted: true, handle: 'task_workflow' },
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
  it('shows the run in the conversation: the track, a selected step, and the workflow the agent wrote', async () => {
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
          flow: 'workflow',
          label: 'Workflow',
          handle: 'task_workflow',
          args: { task: 'Compare the sites.' },
        }}
        sessionId="sess_1"
      />,
    );
    expect(await screen.findByText('Workflow run')).toBeVisible();
    expect(await screen.findByText('3 steps, 1 done, 1 running, 1 waiting')).toBeVisible();
    expect(screen.getByRole('img', { name: /The workflow's 3 steps in order/u })).toHaveAttribute(
      'data-kind',
      'railroad',
    );
    // The track's colours are explained once, in words; no row repeats each step.
    expect(screen.getByText('Select a step to see it')).toBeVisible();
    for (const word of ['done', 'running', 'waiting']) expect(screen.getByText(word)).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Workflow steps' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'clean: Completed. Runs this agent.' }));
    const details = screen.getByRole('region', { name: 'clean: Completed' });
    expect(within(details).getByText('Clean the measurements and log every rule.')).toBeVisible();
    await waitFor(() => expect(within(details).getByText('2 min 5 s')).toBeVisible());
    await user.click(within(details).getByRole('button', { name: 'Close clean' }));
    expect(screen.queryByRole('region', { name: 'clean: Completed' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'south: Waiting. Runs reviewer.' }));
    expect(screen.getByRole('region', { name: 'south: Waiting' })).toHaveTextContent(
      'Waits on: clean',
    );

    await user.click(screen.getByText('Show the workflow'));
    expect(screen.getByText('Compare the sites.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByText(/"task": "Compare the sites."/u)).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: /Open the workflow run in the side panel/u }),
    );
    expect(onOpenFlow).toHaveBeenCalledWith('task_workflow', 'Workflow run');
  });

  it('stands as its own boundary in the conversation, once', async () => {
    repository.taskFlow.mockResolvedValue(run);
    repository.agentTask.mockResolvedValue({ task_id: 'x', created_at: '', updated_at: '' });
    const iteration: ConversationIteration = {
      id: 'assistant_1:iteration:0',
      index: 0,
      agentId: 'main',
      thinking: [],
      nextThoughts: ['Start the workflow.'],
      activity: [{ kind: 'tool', id: 'call_workflow', tool: workflowTool }],
      tools: [workflowTool],
      tasks: [],
      terminal: false,
      interrupted: false,
      streaming: false,
      summary: 'Start the workflow.',
    };
    wrap(
      <ConversationTurn
        iterations={[iteration]}
        messageSessionId="sess_1"
        mode="chain"
        subagents={{}}
      />,
    );
    expect(await screen.findByText('Workflow run')).toBeVisible();
    expect(screen.getAllByText('Workflow run')).toHaveLength(1);
    expect(repository.taskFlow).toHaveBeenCalledWith('sess_1', 'task_workflow', expect.anything());
  });
});
