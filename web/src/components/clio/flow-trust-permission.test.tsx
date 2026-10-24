import type { PendingInteraction, PluginReview } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';

const repository = { pluginReview: vi.fn<(url: string) => Promise<PluginReview>>() };
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
// Pele draws in a browser; here a drawing stands in, and a "broken" source fails to draw.
const renderPeleDiagram = vi.fn(async (source: string) =>
  source.includes('broken') ? undefined : `<svg data-testid="shape"><text>drawn</text></svg>`,
);
vi.mock('./diagram-renderer', () => ({
  renderPeleDiagram: (source: string) => renderPeleDiagram(source),
}));

import { PermissionResponse } from './permission-response';

afterEach(() => {
  cleanup();
  repository.pluginReview.mockReset();
  renderPeleDiagram.mockClear();
});

const SHAPE =
  'railroad-beta\ndebate = sequence(oneOrMore(choice(terminal("side 1"), terminal("side 2"))), terminal("judge"));';

function review(overrides: Partial<PluginReview> = {}): PluginReview {
  return {
    name: 'debate',
    version: '0.2.0',
    description: 'Any number of sides argue a question, then a judge decides.',
    flows: [
      {
        id: 'debate',
        description: 'Sides argue in rounds. Options: sides, judge, max_rounds.',
        shape: SHAPE,
        file: 'ai.iowarp.clio/flows/debate.py',
      },
    ],
    reach: [],
    unreadable: [],
    files: {
      'plugin.json': '{"name": "debate"}',
      'ai.iowarp.clio/flows/debate.py': 'class Debate(Flow):\n    id = "debate"\n',
    },
    files_truncated: false,
    authored_by_clio: true,
    ...overrides,
  };
}

function permission(input: Record<string, unknown> = {}): PendingInteraction {
  return {
    id: 'permission:perm_1',
    kind: 'permission',
    owner_session_id: 'sess_1',
    attended_session_id: 'sess_1',
    status: 'pending',
    title: 'Run the debate flow, written by Clio, which is not trusted yet',
    source: { protocol: 'native', tool_name: 'run_flow' },
    created_at: '2026-10-22T00:00:00Z',
    actions: ['allow', 'allow_session', 'allow_workspace', 'deny'],
    payload: {
      permission_id: 'perm_1',
      tool_call: {
        tool_name: 'run_flow',
        input: {
          flow: 'debate',
          plugin: 'debate',
          version: '0.2.0',
          author: 'Clio',
          authored_by_clio: true,
          file: 'ai.iowarp.clio/flows/debate.py',
          review_url: '/v1/plugins/debate/review',
          input: { question: 'Tabs or spaces?' },
          options: { sides: 2 },
          ...input,
        },
      },
    },
  };
}

function renderCard(interaction: PendingInteraction, onResponse = vi.fn(async () => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PermissionResponse interaction={interaction} onResponse={onResponse} showOwner={false} />
    </QueryClientProvider>,
  );
  return onResponse;
}

describe('flow trust permission', () => {
  it('names the flow, its author and its file, and trusts on "Trust and run"', async () => {
    const user = userEvent.setup();
    const onResponse = renderCard(permission());
    expect(screen.getByText('Running flow debate')).toBeInTheDocument();
    expect(screen.getByText(`Authored by ${vocab.agent} · not trusted yet`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'debate.py' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
    // Trust lasts, so there is no duration to pick.
    expect(screen.queryByRole('combobox', { name: 'Permission duration' })).not.toBeInTheDocument();
    expect(screen.queryByText('Once')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trust and run' }));
    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'permission:perm_1' }), {
      action: 'allow',
    });
    expect(repository.pluginReview).not.toHaveBeenCalled();
  });

  it('names a marketplace plugin by where it came from', () => {
    renderCard(permission({ author: 'iowarp', authored_by_clio: false }));
    expect(screen.getByText('From iowarp · not trusted yet')).toBeInTheDocument();
  });

  it('leaves other permissions as they were', () => {
    renderCard({
      ...permission(),
      source: { protocol: 'native', tool_name: 'shell_bash' },
      title: 'Run a command',
      payload: { tool_call: { tool_name: 'shell_bash', input: { command: 'ls' } } },
    });
    expect(screen.getByRole('button', { name: 'Allow once' })).toHaveTextContent('Allow');
    expect(screen.queryByText(/Running flow/u)).not.toBeInTheDocument();
  });

  it('opens the review from the file: description, diagram and reach first, code one click away', async () => {
    const user = userEvent.setup();
    repository.pluginReview.mockResolvedValue(review({ files_truncated: true }));
    renderCard(permission());
    await user.click(screen.getByRole('button', { name: 'debate.py' }));
    const dialog = await screen.findByRole('dialog');
    expect(repository.pluginReview).toHaveBeenCalledWith(
      '/v1/plugins/debate/review',
      expect.anything(),
    );
    expect(
      await within(dialog).findByText(
        'Any number of sides argue a question, then a judge decides.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByTestId('shape')).toBeInTheDocument());
    expect(renderPeleDiagram).toHaveBeenCalledWith(SHAPE);
    expect(
      within(dialog).getByText(
        `Works only through ${vocab.agent}'s agents: it does not open files, use the network or run commands itself.`,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Read from its code.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/class Debate/u)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Show the code' }));
    expect(within(dialog).getByText('ai.iowarp.clio/flows/debate.py')).toBeInTheDocument();
    expect(within(dialog).getByText(/class Debate\(Flow\)/u)).toBeInTheDocument();
    expect(
      within(dialog).getByText('The code is long, so only its beginning is shown here.'),
    ).toBeInTheDocument();
  });

  it('says what the code reaches in words, and counts unreadable files as unknown', async () => {
    const user = userEvent.setup();
    repository.pluginReview.mockResolvedValue(
      review({ reach: ['files', 'network'], unreadable: ['ai.iowarp.clio/flows/x.py'] }),
    );
    renderCard(permission());
    await user.click(screen.getByRole('button', { name: 'debate.py' }));
    const reach = await screen.findByRole('region', { name: 'What it can reach' });
    expect(
      within(reach)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Reads or writes files directly',
      'Uses the network directly',
      "Some of its files could not be read (ai.iowarp.clio/flows/x.py), so what they do can't be read from the code",
    ]);
    expect(within(reach).queryByText(/Works only through/u)).not.toBeInTheDocument();
  });

  it('says when a flow has no diagram, and shows the source of one that cannot be drawn', async () => {
    const user = userEvent.setup();
    repository.pluginReview.mockResolvedValue(
      review({
        flows: [
          { id: 'plain', description: '', shape: '', file: '' },
          { id: 'odd', description: '', shape: 'railroad-beta\nbroken (', file: '' },
        ],
      }),
    );
    renderCard(permission({ flow: 'plain' }));
    await user.click(screen.getByRole('button', { name: 'debate.py' }));
    expect(await screen.findByText('No diagram was drawn for this flow.')).toBeInTheDocument();
    expect(
      await screen.findByText(
        "This flow's diagram could not be drawn. Here is how it was written:",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/broken \(/u)).toBeInTheDocument();
  });

  it('says when the review cannot be loaded and offers to try again', async () => {
    const user = userEvent.setup();
    repository.pluginReview.mockRejectedValueOnce(new Error('404 plugin_not_found'));
    renderCard(permission());
    await user.click(screen.getByRole('button', { name: 'debate.py' }));
    expect(await screen.findByText(/The plugin's review could not be loaded/u)).toBeInTheDocument();
    repository.pluginReview.mockResolvedValueOnce(review());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('Any number of sides argue a question, then a judge decides.'),
    ).toBeInTheDocument();
  });
});
