import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const repository = vi.hoisted(() => ({
  allSessions: vi.fn().mockResolvedValue([
    {
      id: 'sess_other',
      workspace_id: 'ws_science',
      title: 'Earlier campaign',
      state: 'completed',
      created_at: '2026-08-22T00:00:00Z',
      updated_at: '2026-08-22T01:00:00Z',
      mode: 'edit',
      edit_mode: 'diff',
      routing_mode: 'auto',
      approval_mode: 'ask',
      pinned: false,
      archived: false,
    },
    {
      id: 'sess_memory',
      workspace_id: 'ws_science',
      title: 'NDP evidence campaign',
      state: 'completed',
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T01:00:00Z',
      mode: 'edit',
      edit_mode: 'diff',
      routing_mode: 'auto',
      approval_mode: 'ask',
      pinned: false,
      archived: false,
    },
    {
      id: 'sess_child',
      parent_session_id: 'sess_memory',
      workspace_id: 'ws_science',
      title: 'NDP task',
      state: 'completed',
      created_at: '2026-08-23T00:10:00Z',
      updated_at: '2026-08-23T00:20:00Z',
      mode: 'edit',
      edit_mode: 'diff',
      routing_mode: 'auto',
      approval_mode: 'ask',
      pinned: false,
      archived: false,
    },
  ]),
  memoryStatistics: vi.fn().mockResolvedValue({
    cache: { hits: 3, misses: 1, hit_rate: 0.75, capacity: 1000 },
    session: {
      session_id: 'sess_memory',
      messages_retained: 24,
      tokens_retained: 1200,
      tokens_budget: 8000,
      profiles_attached: 0,
      context_files_attached: 2,
      context_files_by_mode: { read: 2 },
      compact_summaries: 1,
      token_pressure: 0.15,
      threshold_state: 'normal',
      compaction_recommended: false,
    },
    global: { conversations_total: 8, invocations_total: 21 },
    metadata: { retained_context_source: 'visible_gact_transcript' },
  }),
  memoryEvents: vi.fn().mockResolvedValue([
    {
      id: 'mem_1',
      version: 1,
      type: 'compact_summary',
      session_id: 'sess_memory',
      created_at: '2026-08-23T01:00:00Z',
      updated_at: '2026-08-23T01:00:00Z',
      summary_message_id: 'msg_summary',
      archived_count: 24,
      summary_chars: 400,
      transcript_chars: 4000,
      focus: 'Preserve the anomaly evidence and next operator action.',
      arc_status: 'stored',
      metadata: { source: 'gact_compact' },
    },
  ]),
  searchMemory: vi.fn().mockResolvedValue({
    query: 'anomaly evidence',
    include_cross_session: false,
    searched_sessions: ['sess_memory'],
    hits: [
      {
        session_id: 'sess_memory',
        session_title: 'NDP evidence campaign',
        workspace_id: 'ws_science',
        message_id: 'msg_match',
        role: 'assistant',
        created_at: '2026-08-23T00:30:00Z',
        text: 'The anomaly evidence was retained with its provenance.',
        score: 1,
        match_terms: ['anomaly', 'evidence'],
        metadata: {},
      },
    ],
    metadata: {},
  }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { MemorySettings } from './settings-memory';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettings(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('memory settings', () => {
  it('searches the selected session and exposes retained summaries as exact links', async () => {
    const user = userEvent.setup();
    renderSettings(<MemorySettings initialSessionId="sess_memory" />);

    expect(await screen.findByText('Retained session context')).toBeInTheDocument();
    expect(screen.getByText('Within context budget')).toBeVisible();
    expect(screen.queryByText('normal')).not.toBeInTheDocument();
    expect(screen.getByText('Retained')).toBeVisible();
    expect(screen.getByText('Source Service compaction, version 1')).toBeVisible();
    expect(
      screen.getByText('Preserve the anomaly evidence and next operator action.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open retained summary in conversation' }),
    ).toHaveAttribute('href', '/workspaces/ws_science/sessions/sess_memory#message-msg_summary');

    await user.click(screen.getByRole('combobox', { name: 'Session' }));
    expect(screen.queryByRole('option', { name: 'NDP task' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'NDP evidence campaign' }));

    await user.type(
      screen.getByRole('textbox', { name: 'Find remembered evidence or decisions' }),
      'anomaly evidence',
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByText('The anomaly evidence was retained with its provenance.'),
    ).toBeVisible();
    expect(repository.searchMemory).toHaveBeenCalledWith(
      'anomaly evidence',
      {
        sessionId: 'sess_memory',
        includeCrossSession: false,
        limit: 50,
      },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('link', { name: 'Open NDP evidence campaign at matching message' }),
    ).toHaveAttribute('href', '/workspaces/ws_science/sessions/sess_memory#message-msg_match');
  });

  it('expands recall only after the explicit cross-session control is selected', async () => {
    const user = userEvent.setup();
    renderSettings(<MemorySettings initialSessionId="sess_memory" />);
    await screen.findByText('Retained session context');

    await user.click(
      screen.getByRole('checkbox', { name: /Include related sessions in this workspace/u }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Find remembered evidence or decisions' }),
      'prior decision',
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(repository.searchMemory).toHaveBeenCalledWith(
        'prior decision',
        {
          sessionId: 'sess_memory',
          includeCrossSession: true,
          limit: 50,
        },
        expect.any(AbortSignal),
      ),
    );
  });
});
