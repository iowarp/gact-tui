import type { SessionAgent } from '@clio/core/v3';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addHdf5,
  agentRepository as repository,
  agentTranscript as transcript,
  emptyDelta,
  openUse,
  renderAgentView,
  resolution,
  seedAgentRepository,
  sessionAgent,
} from '@/test-fixtures/agent-tab';

vi.mock('@/hooks/use-repository', async () => {
  const { agentRepository } = await import('@/test-fixtures/agent-tab');
  return { useRepository: () => agentRepository };
});
vi.mock(
  '@/hooks/use-provider-groups',
  async () => (await import('@/test-fixtures/agent-tab')).providerGroupsMock,
);
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('@/hooks/use-session-message-count', async () => {
  const { agentTranscript } = await import('@/test-fixtures/agent-tab');
  return { useSessionMessageCount: () => agentTranscript.messages };
});
vi.mock('sonner', () => ({
  toast: { dismiss: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { AgentCompositionView, DraftAgentCompositionView } from './agent-composition-view';

function renderView(view = <AgentCompositionView sessionId="sess_1" />) {
  return renderAgentView(view);
}

// The drill-in is a lazy chunk; load it once so the first test does not wait on a cold import.
beforeAll(() => import('./agent-tab-drill-in'));
beforeEach(seedAgentRepository);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgentCompositionView', () => {
  it('shows every active plugin with its provenance and nests pack members under their pack', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user);
    const active = await screen.findByRole('list', { name: 'Active plugins' });
    expect(within(active).getByText('Core')).toBeVisible();
    expect(within(active).getAllByText('From standard')).toHaveLength(2);
    expect(within(active).getByText('Required by pdf')).toBeVisible();
    const members = within(active).getByRole('list', { name: 'Members of documents' });
    expect(within(members).getByText('In pack documents')).toBeVisible();
    expect(within(members).getByText('xlsx (not in this conversation)')).toBeVisible();
    expect(within(active).getByText('1 of 2 members in this conversation')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove core' })).toBeNull();
    expect(screen.getByText('Removed by you')).toBeVisible();
  });

  it('summarizes what each plugin adds on its line', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user);
    const active = await screen.findByRole('list', { name: 'Active plugins' });
    expect(within(active).getByText('1 tool, 1 skill, 1 prompt part')).toBeVisible();
    expect(within(active).getByText('1 MCP server')).toBeVisible();
    expect(within(active).getByText('1 tool')).toBeVisible();
    expect(within(active).getAllByText('Nothing of its own')).toHaveLength(1);
  });

  it('expands a plugin to the details the resolution reports and collapses it again', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user);
    const toggle = await screen.findByRole('button', { name: 'shell' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'shell details' })).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByRole('group', { name: 'shell details' });
    expect(within(details).getByText('shell plugin')).toBeVisible();
    expect(within(details).getByText('shell_run')).toBeVisible();
    expect(within(details).getByText('gh-releases')).toBeVisible();
    expect(within(details).getByText('Cut a release with gh.')).toBeVisible();
    expect(within(details).getByText('shell.prefer-gh')).toBeVisible();
    expect(within(details).getByText('Capabilities, about 12 tokens')).toBeVisible();
    expect(within(details).getByText('Version 1.0.0, from clio')).toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'shell details' })).toBeNull();
  });

  it('expands pack members by keyboard and names requirements both ways', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user);
    const members = await screen.findByRole('list', { name: 'Members of documents' });
    within(members).getByRole('button', { name: 'pdf' }).focus();
    await user.keyboard('{Enter}');
    const pdf = screen.getByRole('group', { name: 'pdf details' });
    expect(within(pdf).getByText('Requires')).toBeVisible();
    expect(within(pdf).getByText('document-runtime')).toBeVisible();
    expect(within(pdf).getByText('pdf-reader')).toBeVisible();
    expect(within(pdf).getByText('stdio')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'document-runtime' }));
    const runtime = screen.getByRole('group', { name: 'document-runtime details' });
    expect(within(runtime).getByText('Required by')).toBeVisible();
    expect(within(runtime).getByText('pdf')).toBeVisible();
    expect(within(runtime).getByText('prepare_document')).toBeVisible();
  });

  it('expands and collapses every plugin at once', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user);
    await user.click(await screen.findByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByRole('group', { name: / details$/u })).toHaveLength(4);
    expect(screen.getByRole('list', { name: 'Members of documents' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Explore documents files' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryAllByRole('group', { name: / details$/u })).toHaveLength(0);
    expect(screen.queryByRole('list', { name: 'Members of documents' })).not.toBeInTheDocument();
  });

  it('says a pack left because none of its members remain', async () => {
    const user = userEvent.setup();
    repository.sessionAgent.mockResolvedValue({
      ...sessionAgent,
      resolution: {
        ...resolution,
        removed: [
          { id: 'docx', reason: 'cascade', because: 'document-runtime' },
          { id: 'slides', reason: 'pack_empty', because: '' },
        ],
      },
    });
    renderView();
    await openUse(user);
    const removed = await screen.findByRole('region', { name: 'Removed plugins' });
    expect(within(removed).getByText('Left because none of its members remain')).toBeVisible();
    expect(
      within(removed).getByText('Left with document-runtime, which it requires'),
    ).toBeVisible();
  });

  it('warns once before a removal, with its cascade, and applies the whole delta only on a yes', async () => {
    const user = userEvent.setup();
    repository.previewPluginRemoval.mockResolvedValue({
      plugin: 'document-runtime',
      removes: [
        { id: 'pdf', reason: { reason: 'cascade', because: 'document-runtime' } },
        { id: 'document-runtime', reason: { reason: 'removed', because: '' } },
        { id: 'documents', reason: { reason: 'pack_empty', because: '' } },
      ],
      tools_removed: ['prepare_document'],
    });
    renderView();
    await openUse(user);
    await user.click(await screen.findByRole('button', { name: 'Remove document-runtime' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(within(dialog).getByRole('heading', { name: 'Warning' })).toBeVisible();
    expect(
      within(dialog).getByText('Removes document-runtime from this conversation.'),
    ).toBeVisible();
    expect(await within(dialog).findByText('pdf')).toBeVisible();
    expect(within(dialog).getByText('requires document-runtime')).toBeVisible();
    expect(within(dialog).getByText('none of its members remain')).toBeVisible();
    expect(within(dialog).getByText('prepare_document')).toBeVisible();
    expect(repository.previewPluginRemoval).toHaveBeenCalledWith({
      ref: 'clio/standard',
      plugin: 'document-runtime',
      delta: { add: [], remove: ['xlsx'] },
    });
    expect(repository.updateSessionAgent).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Yes, as an injection' }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
        delta: { add: [], remove: ['xlsx', 'document-runtime'] },
        apply: 'note',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it.each([
    ['Yes', 'now'],
    ['Yes, after compaction', 'compact'],
    ['Yes, as an injection', 'note'],
  ] as const)('sends apply %s → %s for an add from the + menu', async (choice, apply) => {
    const user = userEvent.setup();
    renderView();
    const dialog = await addHdf5(user);
    expect(within(dialog).getByRole('heading', { name: 'Warning' })).toBeVisible();
    expect(
      within(dialog).getByText(
        'Changing plugins changes the system prompt, which invalidates the prompt cache, so the next model call may cost more.',
      ),
    ).toBeVisible();
    expect(within(dialog).getByText('Do you want to proceed?')).toBeVisible();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'YesRebuilds the prompt cache on the next call.',
      'Yes, after compactionCompacts the conversation now; the change goes in with it.',
      'Yes, as an injectionTells the agent now; the prompt changes at the next compaction. Added tools are announced, not listed; removed plugins stay visible to the agent until then.',
      'No',
    ]);
    // No default: "No" holds the focus, never a yes.
    expect(within(dialog).getByRole('button', { name: 'No' })).toHaveFocus();
    expect(repository.updateSessionAgent).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: choice }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
        delta: { add: ['clio/hdf5'], remove: ['xlsx'] },
        apply,
      }),
    );
  });

  it('sends nothing when the person says No', async () => {
    const user = userEvent.setup();
    renderView();
    const dialog = await addHdf5(user);
    await user.click(within(dialog).getByRole('button', { name: 'No' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Add back' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(repository.updateSessionAgent).not.toHaveBeenCalled();
  });

  it('applies at once on a conversation with no messages, where nothing is cached', async () => {
    transcript.messages = 0;
    const user = userEvent.setup();
    renderView();
    await openUse(user, 'Tools', false);
    await user.click(await screen.findByRole('button', { name: 'Add plugin' }));
    await user.click(await screen.findByRole('option', { name: /hdf5/u }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
        delta: { add: ['clio/hdf5'], remove: ['xlsx'] },
        apply: 'now',
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows the compaction running and says so when it fails', async () => {
    const user = userEvent.setup();
    let finish!: (value: SessionAgent) => void;
    repository.updateSessionAgent.mockImplementationOnce(
      () => new Promise<SessionAgent>((resolve) => (finish = resolve)),
    );
    renderView();
    await openUse(user);
    await user.click(await screen.findByRole('button', { name: 'Add back' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Yes, after compaction' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Compacting the conversation. This calls the model and can take a few seconds…',
    );
    expect(within(dialog).getByRole('button', { name: 'Yes' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'No' })).toBeDisabled();
    finish({
      ...sessionAgent,
      delta: emptyDelta,
      prompt_basis: { ...sessionAgent.prompt_basis, pending: true, added: ['xlsx'] },
      compaction: {
        compacted: false,
        error: { error: { error: 'compaction_failed', message: 'the model timed out' } },
      },
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(toast.warning).toHaveBeenCalledWith('The compaction failed', {
      description:
        'Added xlsx back, but the conversation was not compacted (the model timed out). The change was sent as an injection instead and joins the system prompt at the next compaction.',
      duration: 12_000,
    });
    expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
      delta: emptyDelta,
      apply: 'compact',
    });
  });

  it('shows a change waiting for compaction and compacts on request', async () => {
    const user = userEvent.setup();
    repository.sessionAgent.mockResolvedValue({
      ...sessionAgent,
      prompt_basis: {
        ...sessionAgent.prompt_basis,
        digest: 'old',
        pending: true,
        added: ['shell'],
        removed: ['xlsx'],
      },
    });
    repository.compactSession.mockResolvedValue({ session_id: 'sess_1', compacted: true });
    renderView();
    await openUse(user);
    const notice = await screen.findByRole('region', {
      name: 'Plugin changes waiting for compaction',
    });
    expect(notice).toHaveTextContent(
      'These changes were sent as an injection. They join the system prompt at the next compaction.',
    );
    expect(notice).toHaveTextContent('Addedshell');
    expect(notice).toHaveTextContent('Removedxlsx');
    const active = screen.getByRole('list', { name: 'Active plugins' });
    expect(within(active).getAllByText('Announced to the agent')).toHaveLength(1);
    const removed = screen.getByRole('region', { name: 'Removed plugins' });
    expect(within(removed).getByText('Still in the agent’s prompt until compaction')).toBeVisible();
    await user.click(within(notice).getByRole('button', { name: 'Compact now' }));
    await waitFor(() => expect(repository.compactSession).toHaveBeenCalledWith('sess_1'));
    await waitFor(() => expect(repository.sessionAgent).toHaveBeenCalledTimes(2));
    expect(toast.success).toHaveBeenCalledWith('Conversation compacted', {
      description: 'The plugin changes are in the agent’s system prompt now.',
    });
  });

  it('switches the conversation agent only after the warning', async () => {
    const user = userEvent.setup();
    repository.agents.mockResolvedValue([
      { ref: 'clio/standard', id: 'standard', name: 'Standard', plugins: [], kind: 'agent' },
      { ref: 'clio/science', id: 'science', name: 'Scientist', plugins: [], kind: 'agent' },
    ]);
    renderView();
    await user.click(await screen.findByRole('button', { name: /^Setup: Standard/u }));
    await user.click(await screen.findByRole('option', { name: /Scientist/u }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'Switches this conversation to Scientist, without this conversation’s plugin changes.',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
        ref: 'clio/science',
        delta: emptyDelta,
        apply: 'now',
      }),
    );
  });

  it('saves the composition as a user agent: parent plus delta', async () => {
    const user = userEvent.setup();
    repository.saveUserAgent.mockResolvedValue({
      ref: 'user/my-analyst',
      id: 'my-analyst',
      name: 'My analyst',
      kind: 'user',
      plugins: [],
    });
    renderView();
    await user.click(await screen.findByRole('button', { name: 'Save as a setup…' }));
    await user.type(screen.getByRole('textbox', { name: 'Agent name' }), 'My analyst');
    expect(screen.getByText('Saved as user/my-analyst.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    await waitFor(() =>
      expect(repository.saveUserAgent).toHaveBeenCalledWith({
        id: 'my-analyst',
        name: 'My analyst',
        create_only: true,
        description: '',
        extends: 'clio/standard',
        add: [],
        remove: ['xlsx'],
      }),
    );
  });

  it('attributes every prompt fragment to its plugin', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user, 'Instructions');
    expect(
      await screen.findByRole('article', { name: 'shell.prefer-gh from shell' }),
    ).toHaveTextContent('Prefer gh.');
    expect(
      screen.getByRole('article', { name: 'standard.identity from Agent standard' }),
    ).toHaveTextContent('You are the standard agent.');
    expect(screen.getByRole('region', { name: 'Capabilities section' })).toBeVisible();
  });

  it('folds each prompt fragment to one line and searches them', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user, 'Instructions');
    const shell = await screen.findByRole('article', { name: 'shell.prefer-gh from shell' });
    const row = within(shell).getByRole('button');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByRole('searchbox', { name: 'Search the prompt' }), 'gh');
    expect(await screen.findByText('1 of 2 fragments match.')).toBeVisible();
    expect(
      screen.queryByRole('article', { name: 'standard.identity from Agent standard' }),
    ).toBeNull();
    expect(within(shell).getByText('gh', { selector: 'mark' })).toBeVisible();
  });

  it('says so instead of calling plugin routes when the service lacks agent plugins', async () => {
    repository.capabilities.mockResolvedValueOnce({ capabilities: {}, gact_versions: [] });
    const { container } = renderView();
    expect(await screen.findByText('Agents are not composable here')).toBeVisible();
    expect(container.querySelector('[data-slot="state-view"]')).toHaveAttribute(
      'data-kind',
      'unavailable',
    );
    expect(repository.sessionAgent).not.toHaveBeenCalled();
    expect(repository.plugins).not.toHaveBeenCalled();
  });

  it('keeps a defined subagent read-only', async () => {
    const user = userEvent.setup();
    repository.sessionAgent.mockResolvedValue({ ...sessionAgent, subagent: true });
    renderView();
    expect(await screen.findByText(/runs a defined subagent/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Setup:/u })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save as a setup…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset to setup' })).toBeNull();
    await openUse(user);
    expect(screen.queryByRole('button', { name: 'Add plugin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove shell' })).toBeNull();
  });

  it('lays out the agent as the setup it runs with and what it can use', async () => {
    const { container } = renderView();
    const grid = (label: string) =>
      container.querySelector<HTMLElement>(`dl[aria-label="${label}"]`)!;
    expect(await screen.findByRole('heading', { name: 'Agent for Station review' })).toBeVisible();
    expect(screen.getByText('Changed settings are teal')).toBeVisible();
    const runs = grid('Runs with');
    expect(within(runs).getByRole('button', { name: 'Setup: Standard' })).toBeVisible();
    expect(
      await within(runs).findByRole('button', { name: 'Model: OpenRouter / mercury-3' }),
    ).toBeVisible();
    expect(within(runs).getByText(/Medium/u)).toBeVisible();
    expect(within(runs).getByRole('button', { name: 'Permissions: Ask first' })).toBeVisible();
    const uses = grid('What it can use');
    expect(
      await within(uses).findByRole('button', {
        name: 'Tools: 2 of 3, changed for this conversation',
      }),
    ).toHaveClass('text-changed');
    expect(within(uses).getByRole('button', { name: 'Subagents: None' })).toBeVisible();
    expect(within(uses).getByRole('button', { name: 'Skills: gh-releases' })).toBeVisible();
    expect(
      within(uses).getByRole('button', { name: 'Instructions: 2 prompt parts' }),
    ).toBeVisible();
    expect(repository.resolveAgent).toHaveBeenCalledWith(
      'clio/standard',
      emptyDelta,
      expect.anything(),
    );
    expect(screen.getByText('This conversation changes Standard: removes xlsx.')).toBeVisible();
  });

  it('opens a drill-in with the plugins that add it and returns to its row', async () => {
    const user = userEvent.setup();
    renderView();
    await openUse(user, 'Skills', false);
    const active = await screen.findByRole('list', { name: 'Active plugins' });
    expect(within(active).getByRole('button', { name: 'shell' })).toBeVisible();
    expect(within(active).queryByRole('button', { name: 'core' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to the agent' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Skills: gh-releases' })).toHaveFocus(),
    );
  });

  it('resets the conversation to its setup after the warning', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(await screen.findByRole('button', { name: 'Reset to setup' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText('Restores Standard’s plugins in this conversation.'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
    await waitFor(() =>
      expect(repository.updateSessionAgent).toHaveBeenCalledWith('sess_1', {
        delta: emptyDelta,
        apply: 'now',
      }),
    );
  });

  it('changes the conversation’s confirmations from the Permissions row', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(await screen.findByRole('button', { name: 'Permissions: Ask first' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Workspace edits/u }));
    await waitFor(() =>
      expect(repository.updateSession).toHaveBeenCalledWith('sess_1', {
        approval_mode: 'auto-edits',
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Permissions: Workspace edits, changed for this conversation',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Permissions: Workspace edits/u }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Bypass checks/u }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'The agent may perform supported actions without asking first.',
    );
    expect(repository.updateSession).toHaveBeenCalledTimes(1);
  });
});

describe('the agent of a conversation not yet started', () => {
  const draft = { ref: 'clio/standard', delta: { add: [], remove: ['xlsx'] } };

  beforeEach(() => repository.resolveAgent.mockResolvedValue(resolution));

  function renderDraft(onChange = vi.fn()) {
    renderView(<DraftAgentCompositionView draft={draft} onChange={onChange} />);
    return onChange;
  }

  it('resolves the chosen agent with its changes, without a session', async () => {
    const user = userEvent.setup();
    renderDraft();
    expect(
      await screen.findByRole('heading', { name: 'Agent for a new conversation' }),
    ).toBeVisible();
    expect(screen.getAllByTitle('Choose it in the message box before you send')).toHaveLength(2);
    await openUse(user);
    expect(await screen.findByRole('list', { name: 'Active plugins' })).toBeVisible();
    expect(repository.resolveAgent).toHaveBeenCalledWith(
      'clio/standard',
      { add: [], remove: ['xlsx'] },
      expect.anything(),
    );
    expect(repository.sessionAgent).not.toHaveBeenCalled();
  });

  it('adds a plugin at once: nothing is cached before the first message', async () => {
    const user = userEvent.setup();
    const onChange = renderDraft();
    await openUse(user, 'Tools', false);
    await user.click(await screen.findByRole('button', { name: 'Add plugin' }));
    await user.click(await screen.findByRole('option', { name: /hdf5/u }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        ref: 'clio/standard',
        delta: { add: ['clio/hdf5'], remove: ['xlsx'] },
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(repository.updateSessionAgent).not.toHaveBeenCalled();
  });

  it('shows what leaves with a removal before it applies', async () => {
    const user = userEvent.setup();
    repository.previewPluginRemoval.mockResolvedValue({
      plugin: 'document-runtime',
      removes: [
        { id: 'pdf', reason: { reason: 'cascade', because: 'document-runtime' } },
        { id: 'document-runtime', reason: { reason: 'removed', because: '' } },
      ],
      tools_removed: ['prepare_document'],
    });
    const onChange = renderDraft();
    await openUse(user);
    await user.click(await screen.findByRole('button', { name: 'Remove document-runtime' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByText('requires document-runtime')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        ref: 'clio/standard',
        delta: { add: [], remove: ['xlsx', 'document-runtime'] },
      }),
    );
    expect(repository.updateSessionAgent).not.toHaveBeenCalled();
  });
});
