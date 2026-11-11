import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionRailContent } from './session-rail-content';
import { QuestionAnswerContext } from './question-answer-context';
import type { PendingInteraction } from '@clio/core/v3';

const repository = vi.hoisted(() => ({
  sessionWork: vi
    .fn()
    .mockResolvedValue({ todos: [{ content: 'Check the report', status: 'in_progress' }] }),
  scheduledTurns: vi.fn().mockResolvedValue({
    schedules: [{ id: 'schedule', question: 'Review tomorrow', enabled: true }],
  }),
  connectedSources: vi.fn().mockResolvedValue([
    { id: 'source', label: 'Sensor repository', connected: true },
    { id: 'offline', label: 'Disconnected source', connected: false },
  ]),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://showcase.test' } }),
}));
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
});

const evidence = {
  artifacts: [
    {
      id: 'report',
      session_id: 'session',
      name: 'Report.docx',
      media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      uri: 'artifact://report',
    },
  ],
  contextFiles: [{ path: 'sensor.csv', display_path: 'sensor.csv', mode: 'pin' as const }],
  diffs: [],
  messages: [],
  processes: [],
  tasks: [
    { id: 'task', session_id: 'session', title: 'Review evidence', state: 'running' as const },
  ],
  subagents: [
    {
      id: 'child',
      session_id: 'session',
      title: 'Researcher',
      state: 'running' as const,
      task: 'Check sensors',
    },
  ],
};

describe('session showcase inventory', () => {
  it('keeps the context bar visible, folds its breakdown and lists running children as runs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionRailContent
          onOpenSource={vi.fn()}
          evidence={{
            ...evidence,
            contextFrames: [],
            tools: [],
            runs: [],
            onOpenCanvas: vi.fn(),
            context: {
              session_id: 'session',
              provenance: {
                source: 'server',
                observed_at: '2026-10-21T00:00:00Z',
                stale: false,
              },
              used_tokens: 2200,
              limit_tokens: 10000,
              categories: { tools: 1000, messages: 1200 },
            },
          }}
        />
      </QueryClientProvider>,
    );
    const context = screen.getByRole('region', { name: 'Context section' });
    expect(within(context).getByRole('img', { name: /^Context token composition/ })).toBeVisible();
    expect(within(context).getByRole('button', { name: 'Expand Context' })).toHaveTextContent(
      '2.2K of 10K',
    );
    expect(screen.queryByText('Tool definitions')).not.toBeInTheDocument();
    await userEvent.click(within(context).getByRole('button', { name: 'Expand Context' }));
    expect(screen.getByText('Tool definitions')).toBeVisible();
    expect(screen.getByText('Messages')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open full context view' })).toBeVisible();
    const running = screen.getByRole('region', { name: 'Running section' });
    expect(within(running).getByRole('button', { name: 'Researcher' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Tasks section' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Child agents section' })).not.toBeInTheDocument();
    client.clear();
  });
  it('keeps live questions reachable through the existing workspace answer owner', async () => {
    const interaction: PendingInteraction = {
      id: 'question',
      kind: 'question',
      status: 'pending',
      owner_session_id: 'session',
      attended_session_id: 'session',
      title: 'Choose a time window',
      prompt: 'Which time window should I compare?',
      created_at: '2026-10-21T00:00:00Z',
      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'ask' },
      actions: ['answer', 'cancel'],
    };
    const openQuestion = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QuestionAnswerContext.Provider
          value={{
            interactions: [interaction],
            openQuestion,
            startAnswer: vi.fn(),
            stopAnswer: vi.fn(),
          }}
        >
          <SessionRailContent
            evidence={{ ...evidence, contextFrames: [], tools: [], runs: [] }}
            onOpenSource={vi.fn()}
          />
        </QuestionAnswerContext.Provider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Expand Questions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Read and answer question 1' }));
    expect(openQuestion).toHaveBeenCalledWith(interaction);
    client.clear();
  });
  it('reads connected sources, current todos and schedules from their authoritative inventories', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionRailContent
          evidence={{
            ...evidence,
            contextFrames: [],
            tools: [],
            runs: [],
            sessionId: 'session',
            workspaceId: 'workspace',
          }}
          onOpenSource={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Todos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Schedules' }));
    expect(await screen.findByText('Check the report')).toBeVisible();
    expect(await screen.findByText('Review tomorrow')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Connected sources' }));
    expect(await screen.findByText('Sensor repository')).toBeVisible();
    expect(screen.queryByText('Disconnected source')).not.toBeInTheDocument();
    expect(repository.sessionWork).toHaveBeenCalledWith('session', 0, expect.any(AbortSignal));
    expect(repository.scheduledTurns).toHaveBeenCalledWith('session', expect.any(AbortSignal));
    expect(repository.connectedSources).toHaveBeenCalledWith('workspace', expect.any(AbortSignal));
    client.clear();
  });
  it('shows the live session plan above todos and drops its earlier proposal from Plans', async () => {
    repository.sessionWork.mockResolvedValueOnce({
      todos: [{ content: 'Check the report', status: 'in_progress' }],
      plan: {
        path: 'D:/workspace/.clio/plans/plan.md',
        status: 'approved',
        text: '# Objective\n\nFind the regression.',
      },
    });
    const proposal = (id: string, file: string, title: string): PendingInteraction => ({
      id,
      kind: 'question',
      owner_session_id: 'session',
      attended_session_id: 'session',
      status: 'answered',
      title: 'Review execution plan',
      requires_human_response: true,
      prompt: 'Approve the saved plan?',
      source: { protocol: 'native', tool_name: 'plan_exit', invocation_id: id },
      created_at: '2026-09-05T00:00:00Z',
      payload: {
        answer_metadata: {},
        options: [],
        plan_exit: {
          plan_file: file,
          plan_content: `# ${title}`,
          plan_content_status: 'complete',
          summary: title,
        },
      },
      actions: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionRailContent
          evidence={{
            ...evidence,
            contextFrames: [],
            tools: [],
            runs: [],
            sessionId: 'session',
            workspaceId: 'workspace',
            interactions: [
              proposal('a', 'd:\\workspace\\.clio\\plans\\plan.md', 'Same plan'),
              proposal('b', 'D:/workspace/.clio/plans/older.md', 'Older plan'),
            ],
          }}
          onOpenSource={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const plan = await screen.findByRole('region', { name: 'Plan section' });
    fireEvent.click(within(plan).getByRole('button', { name: 'Expand Plan' }));
    expect(await within(plan).findByText('Find the regression.')).toBeVisible();
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(regions.indexOf('Plan section')).toBeLessThan(regions.indexOf('Todos section'));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Earlier plans' }));
    const plans = screen.getByRole('region', { name: 'Earlier plans section' });
    expect(within(plans).queryByText('Same plan')).not.toBeInTheDocument();
    expect(await within(plans).findByText('Older plan')).toBeInTheDocument();
    client.clear();
  });
  it('opens the selected connected source and current work instead of embedding their pages', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenSource = vi.fn();
    const onOpenWork = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <SessionRailContent
          evidence={{
            ...evidence,
            contextFrames: [],
            tools: [],
            runs: [],
            sessionId: 'session',
            workspaceId: 'workspace',
            onOpenWork,
          }}
          onOpenSource={onOpenSource}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Connected sources' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Sensor repository' }));
    expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ id: 'source' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Todos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Schedules' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Check the report' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Review tomorrow' }));
    expect(onOpenWork).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
