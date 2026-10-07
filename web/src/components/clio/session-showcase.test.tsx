import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioEvidenceView, type ClioEvidenceViewProps } from './observability-evidence';
import { SessionConnectedSources, SessionWorkShowcase } from './session-showcase-inventory';

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

function renderEvidence(props: ClioEvidenceViewProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClioEvidenceView {...props} />
    </QueryClientProvider>,
  );
}

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
  it('puts artifacts and context files in the data section without work categories', () => {
    renderEvidence({ ...evidence, compact: true, section: 'data' });
    expect(screen.getByText('Report.docx')).toBeVisible();
    expect(screen.getByText('sensor.csv')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Tasks,/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Child agents,/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Progress and outputs')).not.toBeInTheDocument();
    expect(screen.queryByText('Used in this session')).not.toBeInTheDocument();
  });
  it('puts tasks and agents in the work section without files or artifacts', () => {
    renderEvidence({ ...evidence, compact: true, section: 'work' });
    expect(screen.getByText('Review evidence')).toBeVisible();
    expect(screen.getByText('Researcher')).toBeVisible();
    expect(screen.queryByText('Report.docx')).not.toBeInTheDocument();
    expect(screen.queryByText('sensor.csv')).not.toBeInTheDocument();
  });
  it('reads connected sources, current todos and schedules from their authoritative inventories', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SessionConnectedSources workspaceId="workspace" />
        <SessionWorkShowcase sessionId="session" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Sensor repository')).toBeVisible();
    expect(await screen.findByText('Check the report')).toBeVisible();
    expect(await screen.findByText('Review tomorrow')).toBeVisible();
    expect(screen.queryByText('Disconnected source')).not.toBeInTheDocument();
    expect(repository.sessionWork).toHaveBeenCalledWith('session', 0, expect.any(AbortSignal));
    expect(repository.scheduledTurns).toHaveBeenCalledWith('session', expect.any(AbortSignal));
    expect(repository.connectedSources).toHaveBeenCalledWith('workspace', expect.any(AbortSignal));
    client.clear();
  });
});
