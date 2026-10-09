import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  it('opens an artifact from a compact row with format, size and timestamp, without an output card', () => {
    const onOpenArtifact = vi.fn();
    const artifact = { ...evidence.artifacts[0]!, size: 158, created_at: '2026-10-08T12:00:00Z' };
    renderEvidence({
      ...evidence,
      artifacts: [artifact],
      compact: true,
      section: 'data',
      onOpenArtifact,
    });
    const row = screen.getByRole('button', { name: 'Open Report.docx' });
    expect(row).toHaveTextContent('158 B');
    expect(row.querySelector('time')).not.toBeNull();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="artifact"]')).toBeNull();
    fireEvent.click(row);
    expect(onOpenArtifact).toHaveBeenCalledWith(artifact);
  });
  it('routes compact files, tasks, and agent runs to their actual full views', () => {
    const onOpenFile = vi.fn();
    const onOpenWork = vi.fn();
    const onOpenActivity = vi.fn();
    renderEvidence({
      ...evidence,
      compact: true,
      onOpenFile,
      onOpenWork,
      onOpenActivity,
      runs: [{ id: 'run', session_id: 'session', state: 'completed', summary: 'Checked sensors' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open sensor.csv' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Review evidence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Checked sensors' }));
    expect(onOpenFile).toHaveBeenCalledWith('sensor.csv');
    expect(onOpenWork).toHaveBeenCalledOnce();
    expect(onOpenActivity).toHaveBeenCalledOnce();
  });
  it('opens the canonical technical details dialog from a compact tool row', async () => {
    renderEvidence({
      ...evidence,
      compact: true,
      section: 'work',
      tools: [
        {
          id: 'tool',
          session_id: 'session',
          name: 'write_file',
          input: { path: 'report.txt' },
          output: 'Saved report',
          state: 'succeeded',
        },
      ],
    });
    expect(screen.queryByText('Saved report')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Technical details for/ }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/Saved report/)).toBeVisible();
  });
  it('opens the selected connected source and current work instead of embedding their pages', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenSource = vi.fn();
    const onOpenWork = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <SessionConnectedSources workspaceId="workspace" onOpenSource={onOpenSource} />
        <SessionWorkShowcase sessionId="session" onOpenWork={onOpenWork} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Open Sensor repository' }));
    expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({ id: 'source' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Check the report' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Review tomorrow' }));
    expect(onOpenWork).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
