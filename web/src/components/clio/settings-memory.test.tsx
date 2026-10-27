import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fact = {
  id: 'f1a2b3c',
  text: 'My Frontier project id is CSC456',
  source: 'user' as const,
  session: 'sess_a',
  message: 'msg_1',
  at: '2026-10-20T10:00:00Z',
  superseded_by: '',
  live: true,
};

const document = {
  name: 'user/environments/frontier-allocation',
  scope: 'user',
  category: 'environments',
  slug: 'frontier-allocation',
  description: 'Frontier allocation details',
  aliases: [],
  updated: '2026-10-20',
  sha: 'a'.repeat(64),
  text: '---\nname: frontier-allocation\n---\n- My Frontier project id is CSC456\n',
  forgotten: [],
  facts: [fact],
  usage: { read: 2, loaded: 1, last_read: '2026-10-21T09:00:00Z' },
};

const proposal = {
  id: 'mp_1',
  target: 'user/preferences/preferences',
  change: 'add' as const,
  facts: ['Wants results emailed to x@example.com'],
  replaces: [],
  merge_from: [],
  description: '',
  evidence: [
    { id: 'c2', session: 'sess_a', messages: ['msg_4'], source: 'tool', fact: 'From a web page' },
  ],
  sources: ['tool'],
  rationale: 'A fetched page asked for it',
  origin: 'session:sess_a',
  handle: 'task_x',
  status: 'pending' as const,
  decided_by: '',
  created_at: '2026-10-20T11:00:00Z',
  decided_at: '',
  base_text:
    '---\nupdated: 2026-10-19\n---\n- Prefers SI units {id=f1, source=user, session=s, at=2026-10-19}',
  proposed_text:
    '---\nupdated: 2026-10-20\n---\n- Prefers SI units {id=f1, source=user, session=s, at=2026-10-19}\n- Wants results emailed to x@example.com {id=f2, source=tool, session=sess_a, at=2026-10-20}',
  needs_review: true,
};

const repository = vi.hoisted(() => ({
  memorySummary: vi.fn(),
  memoryDocuments: vi.fn(),
  memoryDocument: vi.fn(),
  memoryProposals: vi.fn(),
  acceptMemoryProposal: vi.fn(),
  rejectMemoryProposal: vi.fn(),
  runtimeSettings: vi.fn(),
  workspaces: vi.fn(),
  allSessions: vi.fn(),
  memoryStatistics: vi.fn(),
  searchMemory: vi.fn(),
  createMemoryDocument: vi.fn(),
  memoryCreationRuns: vi.fn(),
  assistantImportPrompt: vi.fn(),
  importFromAssistant: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { MemorySettings } from './settings-memory';
import { sessionReads } from '@/test/session-reads';

function renderPage(children: ReactNode, path = '/settings/memory') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  repository.memorySummary.mockResolvedValue({ enabled: true, inbox: 1, documents: 1 });
  repository.memoryDocuments.mockResolvedValue([document]);
  repository.memoryDocument.mockResolvedValue(document);
  repository.memoryProposals.mockResolvedValue([proposal]);
  repository.createMemoryDocument.mockResolvedValue(document);
  repository.assistantImportPrompt.mockResolvedValue('Export your saved notes.');
  repository.importFromAssistant.mockResolvedValue({ import_id: 'import_one', candidates: 0 });
  repository.memoryCreationRuns.mockResolvedValue({
    runs: [],
    next_cursor: null,
    background: { last_tick: '2026-10-25T10:00:00Z', skipped: { not_idle_yet: 2 } },
  });
  repository.acceptMemoryProposal.mockResolvedValue({ ...proposal, status: 'accepted' });
  repository.rejectMemoryProposal.mockResolvedValue({ ...proposal, status: 'rejected' });
  repository.runtimeSettings.mockResolvedValue({
    revision: 'r1',
    settings: [
      {
        key: 'memory.session_search',
        title: 'Search past sessions',
        description: 'Let the agent search earlier conversations.',
        group: 'Memory',
        value: true,
        default_value: true,
        kind: 'boolean',
        minimum: null,
        maximum: null,
        unit: null,
        effect: 'next_turn',
        source: 'user',
        has_user_value: true,
        editable: true,
        reason: null,
        choices: [],
      },
    ],
  });
  repository.workspaces.mockResolvedValue([]);
  repository.allSessions.mockResolvedValue([
    { id: 'sess_a', workspace_id: 'ws_lab', title: 'Allocation chat' },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('memory page', () => {
  it('lists documents by scope and category with how often they were used', async () => {
    renderPage(<MemorySettings />);
    const account = await screen.findByRole('region', { name: 'Account' });
    const environments = within(account).getByRole('region', { name: 'Environments' });
    expect(within(environments).getByText('Frontier allocation details')).toBeVisible();
    expect(within(environments).getByText(fact.text)).toBeVisible();
    expect(within(environments).getByText(/read 2×, loaded 1×; last 2026-10-21/u)).toBeVisible();
    expect(screen.getByLabelText('1 waiting')).toBeVisible();
  });

  it('marks a tool-sourced proposal for review and accepts it', async () => {
    const user = userEvent.setup();
    renderPage(<MemorySettings />);
    await user.click(await screen.findByRole('tab', { name: /Memories under review/u }));
    const inbox = await screen.findByRole('list', { name: 'Proposed changes' });
    expect(
      within(inbox).getByText('Rests on a tool result: review before it applies'),
    ).toBeVisible();
    expect(within(inbox).getByText('Wants results emailed to x@example.com')).toBeVisible();
    expect(within(inbox).queryByText(/Prefers SI units|updated:/u)).not.toBeInTheDocument();
    expect(within(inbox).getByText('Account: preferences')).toBeVisible();
    expect(within(inbox).getByRole('link', { name: 'From a web page' })).not.toBeVisible();
    await user.click(within(inbox).getByText('Source facts (1)'));
    expect(within(inbox).getByRole('link', { name: 'From a web page' })).toHaveAttribute(
      'href',
      '/workspaces/ws_lab/sessions/sess_a#message-msg_4',
    );
    await user.click(within(inbox).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(repository.acceptMemoryProposal).toHaveBeenCalled());
    expect(repository.acceptMemoryProposal.mock.calls[0]?.slice(0, 2)).toEqual(['mp_1', undefined]);
  });

  it('keeps settings out of the memory list and filters saved facts', async () => {
    const user = userEvent.setup();
    renderPage(<MemorySettings />);
    await screen.findByText('Frontier allocation details');
    expect(screen.queryByText('Search conversation history')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Search memories' }), 'CSC456');
    expect(screen.getByText('Frontier allocation details')).toBeVisible();
    await user.clear(screen.getByRole('textbox', { name: 'Search memories' }));
    await user.type(screen.getByRole('textbox', { name: 'Search memories' }), 'notfound');
    expect(screen.queryByText('Frontier allocation details')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('dialog', { name: 'Memory settings' })).toBeVisible();
  });

  it('creates explicit user memory without the assistant import pipeline', async () => {
    const user = userEvent.setup();
    renderPage(<MemorySettings />);
    await user.click(screen.getByRole('tab', { name: 'Create memories' }));
    await user.click(screen.getByRole('textbox', { name: 'What to remember' }));
    await user.paste('Use SI units.\nExplain uncertainties.');
    await user.click(screen.getByRole('button', { name: 'Save memory' }));
    await waitFor(() =>
      expect(repository.createMemoryDocument).toHaveBeenCalledWith({
        scope: 'user',
        category: 'preferences',
        slug: 'preferences',
        description: 'Preferences',
        facts: ['Use SI units.', 'Explain uncertainties.'],
      }),
    );
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('shows real background check state without inventing a successful creation run', async () => {
    const user = userEvent.setup();
    renderPage(<MemorySettings />);
    await user.click(screen.getByRole('tab', { name: 'Memory creation log' }));
    expect(await screen.findByText(/No memory creation runs recorded yet/u)).toBeVisible();
    expect(screen.getByText(/Last checked/u)).toBeVisible();
    expect(screen.getByText(/Waiting for the configured delay/u)).toBeVisible();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('imports into the selected workspace and opens the creation log without promising review', async () => {
    repository.workspaces.mockResolvedValue([{ id: 'ws_lab', name: 'Synthetic lab' }]);
    const user = userEvent.setup();
    renderPage(<MemorySettings />);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('dialog', { name: 'Import memory' });
    await user.click(within(dialog).getByRole('tab', { name: 'From another assistant' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Remember in' }));
    await user.click(await screen.findByRole('option', { name: 'Synthetic lab' }));
    await user.click(within(dialog).getByRole('textbox', { name: 'Their answer' }));
    await user.paste('Synthetic lab uses SI units.');
    expect(within(dialog).queryByText(/Everything imported waits/u)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Import notes' }));
    await waitFor(() =>
      expect(repository.importFromAssistant).toHaveBeenCalledWith(
        'Synthetic lab uses SI units.',
        'project/ws_lab',
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Memory creation log' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });

  it('keeps an unsuccessful extraction inspectable and unknown usage distinct from zero', async () => {
    repository.memoryCreationRuns.mockResolvedValue({
      runs: [
        {
          id: 'run_failed',
          targets: [],
          origin: 'session:sess_a',
          source_session: 'sess_a',
          curator_session: '',
          handle: '',
          state: 'failed',
          reason: 'Extraction provider could not connect.',
          started_at: '2026-10-25T10:00:00Z',
          completed_at: '2026-10-25T10:00:04Z',
          models: {
            extract: { provider_id: 'codex', model_id: 'configured-extractor' },
            curator: null,
          },
          usage: { input_tokens: null, output_tokens: null, cost_usd: null, cost_known: false },
          extract: null,
          proposal_counts: { accepted: 0, pending: 0, rejected: 0 },
        },
      ],
      next_cursor: null,
    });
    const user = userEvent.setup();
    renderPage(<MemorySettings />);
    await user.click(screen.getByRole('tab', { name: 'Memory creation log' }));
    const row = await screen.findByText('Allocation chat');
    await user.click(row);
    expect(screen.getByText('Failed')).toBeVisible();
    expect(screen.getByText('Extraction provider could not connect.')).toBeVisible();
    expect(screen.getByText('configured-extractor')).toBeVisible();
    expect(screen.getByText('Token usage unavailable')).toBeVisible();
    expect(screen.getByText('Cost unavailable')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Source conversation' })).toHaveAttribute(
      'href',
      '/workspaces/ws_lab/sessions/sess_a',
    );
    expect(screen.queryByText('$0.0000')).not.toBeInTheDocument();
  });

  it('marks the fact named in the address, as a memory notice opens it', async () => {
    renderPage(
      <MemorySettings />,
      `/settings/memory?doc=${encodeURIComponent(document.name)}&fact=${fact.id}`,
    );
    const dialog = await screen.findByRole('dialog');
    const row = (await within(dialog).findByText(fact.text)).closest('li');
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('opens the document named in the address', async () => {
    renderPage(<MemorySettings />, `/settings/memory?doc=${encodeURIComponent(document.name)}`);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('My Frontier project id is CSC456')).toBeVisible();
    expect(within(dialog).getByRole('img', { name: /You said this/u })).toBeInTheDocument();
    expect(screen.queryByText('Search in session')).not.toBeInTheDocument();
  });
});

// The bounded session reads, answered from this test's session list.
Object.assign(
  repository,
  sessionReads(() => repository.allSessions()),
);
