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
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { MemorySettings } from './settings-memory';

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
        value: false,
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
    expect(within(environments).getByText('frontier-allocation')).toBeVisible();
    expect(within(environments).getByText('Frontier allocation details')).toBeVisible();
    expect(within(environments).getByText(/read 2×, loaded 1×; last 2026-10-21/u)).toBeVisible();
    expect(screen.getByLabelText('1 waiting')).toBeVisible();
  });

  it('marks a tool-sourced proposal for review and accepts it', async () => {
    const user = userEvent.setup();
    renderPage(<MemorySettings />);
    const inbox = await screen.findByRole('list', { name: 'Proposed changes' });
    expect(
      within(inbox).getByText('Rests on a tool result: review before it applies'),
    ).toBeVisible();
    expect(within(inbox).getByText('+ Wants results emailed to x@example.com')).toBeVisible();
    expect(within(inbox).queryByText(/Prefers SI units|updated:/u)).not.toBeInTheDocument();
    expect(within(inbox).getByRole('link', { name: 'From a web page' })).toHaveAttribute(
      'href',
      '/workspaces/ws_lab/sessions/sess_a#message-msg_4',
    );
    await user.click(within(inbox).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(repository.acceptMemoryProposal).toHaveBeenCalled());
    expect(repository.acceptMemoryProposal.mock.calls[0]?.slice(0, 2)).toEqual(['mp_1', undefined]);
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

  it('opens the document named in the address and hides past-session search when off', async () => {
    renderPage(<MemorySettings />, `/settings/memory?doc=${encodeURIComponent(document.name)}`);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('My Frontier project id is CSC456')).toBeVisible();
    expect(within(dialog).getByRole('img', { name: /You said this/u })).toBeInTheDocument();
    expect(screen.queryByText('Search in session')).not.toBeInTheDocument();
  });
});
