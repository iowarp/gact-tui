import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
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
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { ContextHistorySettings } from './settings-context-history';
import { sessionReads } from '@/test/session-reads';

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

describe('retained context history', () => {
  it('shows retained summaries and their exact source links', async () => {
    renderSettings(<ContextHistorySettings initialSessionId="sess_memory" />);

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
  });
});

// The bounded session reads, answered from this test's session list.
Object.assign(
  repository,
  sessionReads(() => repository.allSessions()),
);
