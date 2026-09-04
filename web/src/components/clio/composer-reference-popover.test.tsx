import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer, type ClioComposerProps } from './composer';
import { editorCaretOffset } from './composer-editor-model';

const repositoryMocks = vi.hoisted(() => ({
  workspaceReferences: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repositoryMocks }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(cleanup);

/** The composer's editor: a combobox because it drives the reference popover. */
function composerEditor(): HTMLElement {
  return screen.getByRole('combobox', { name: /investigate, build, explain, or act/ });
}

function placeCaret(editor: HTMLElement, offset: number): void {
  const textNode = editor.firstChild;
  expect(textNode).not.toBeNull();
  const range = document.createRange();
  range.setStart(textNode as Node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(editor);
}

beforeEach(() => {
  repositoryMocks.workspaceReferences.mockReset();
  repositoryMocks.workspaceReferences.mockResolvedValue([]);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
});

function renderComposer({
  onSubmit = vi.fn(async () => undefined),
}: { onSubmit?: ClioComposerProps['onSubmit'] } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <button type="button">Outside the composer</button>
        <ClioComposer
          attachments={false}
          contextReferences
          effort="medium"
          model="gpt-5.6-luna"
          onSubmit={onSubmit}
          provider="codex"
          state="completed"
          workspaceId="workspace_1"
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
  return { onSubmit };
}

const artifactReference = {
  kind: 'artifact' as const,
  id: 'artifact_plot',
  label: 'Displacement plot',
  detail: 'Displacement plot v3 (image)',
  media_type: 'image/png',
  revision: 'v3',
  navigation: { artifact_id: 'artifact_plot' },
};

const notesReference = {
  kind: 'artifact' as const,
  id: 'artifact_notes',
  label: 'Review notes.md',
  detail: 'Review notes.md v2 (document)',
  media_type: 'text/markdown',
  revision: 'v2',
  navigation: { artifact_id: 'artifact_notes' },
};

const readmeReference = {
  kind: 'workspace_file' as const,
  id: 'README.md',
  label: 'README.md',
  detail: 'README.md (400 bytes)',
  media_type: 'text/markdown',
  revision: 'stat:1:400',
  navigation: { path: 'README.md' },
};

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add context' }));
  await user.click(screen.getByRole('menuitem', { name: 'Reference existing context' }));
  const search = await screen.findByPlaceholderText(/Search evidence/);
  // The menu that opened this hands focus back to its own trigger as it closes,
  // so the search box is focused here rather than relying on that race.
  await user.click(search);
  return search;
}

describe('composer reference popover contract', () => {
  it('exposes the mention popover through the editor as a combobox', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference, notesReference]);
    const user = userEvent.setup();
    renderComposer();
    const editor = composerEditor();

    expect(editor).toHaveAttribute('aria-expanded', 'false');
    expect(editor).toHaveAttribute('aria-autocomplete', 'list');
    expect(editor).toHaveAttribute('aria-controls');
    expect(editor).not.toHaveAttribute('aria-activedescendant');

    await user.type(editor, '@');
    await screen.findByRole('option', { name: /Displacement plot/ });

    expect(editor).toHaveAttribute('aria-expanded', 'true');
    const popover = document.getElementById(editor.getAttribute('aria-controls') ?? '');
    expect(popover).not.toBeNull();
    expect(popover).toContainElement(screen.getByRole('listbox'));

    const firstActive = await waitFor(() => {
      const active = editor.getAttribute('aria-activedescendant');
      expect(active).toBeTruthy();
      return active;
    });
    expect(document.getElementById(firstActive ?? '')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      const nextActive = editor.getAttribute('aria-activedescendant');
      expect(nextActive).toBeTruthy();
      expect(nextActive).not.toBe(firstActive);
      expect(document.getElementById(nextActive ?? '')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('closes the mention popover on Escape with the typed text intact', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();
    const editor = composerEditor();

    await user.type(editor, 'ping @alice');
    await screen.findByRole('option', { name: /Displacement plot/ });

    await user.keyboard('{Escape}');

    expect(editor).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    // The literal @ the person meant to write is still there, and still sendable.
    expect(document.querySelector('input[name="message"]')).toHaveValue('ping @alice');
    await waitFor(() => expect(editor).toHaveFocus());

    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: 'ping @alice' })),
    );
  });

  it('dismisses the reference picker with Escape and hands focus back to the editor', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();

    const search = await openPicker(user);
    expect(search).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByPlaceholderText(/Search evidence/)).not.toBeInTheDocument();
    await waitFor(() => expect(composerEditor()).toHaveFocus());
  });

  it('dismisses the reference picker when a click lands outside it', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();

    await openPicker(user);
    await user.click(screen.getByRole('button', { name: 'Outside the composer' }));

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/Search evidence/)).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(composerEditor()).toHaveFocus());
  });

  it('returns focus to the search box after a group is expanded and collapsed', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([readmeReference]);
    const user = userEvent.setup();
    renderComposer();

    const search = await openPicker(user);

    await user.click(await screen.findByRole('button', { name: 'Expand Local files' }));
    await waitFor(() => expect(search).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Collapse Local files' }));
    await waitFor(() => expect(search).toHaveFocus());
  });

  it('returns focus to the editor after a group is expanded from a typed mention', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([readmeReference]);
    const user = userEvent.setup();
    renderComposer();

    await user.type(composerEditor(), '@');
    await user.click(await screen.findByRole('button', { name: 'Expand Local files' }));

    await waitFor(() => expect(composerEditor()).toHaveFocus());
  });
});

describe('composer reference placement', () => {
  it('inserts a picked reference at the caret instead of at the end of the draft', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();
    const editor = composerEditor();

    await user.type(editor, 'before after');
    placeCaret(editor, 'before'.length);
    // jsdom cannot place a caret from a coordinate, so `placeCaret` stands in
    // for the click and fires the mouseup the editor actually reports on.

    await openPicker(user);
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));

    const chip = await screen.findByRole('button', { name: 'Open artifact Displacement plot' });
    const token = chip.closest('[data-reference-token]');
    expect(token?.previousSibling?.textContent).toBe('before ');
    expect(token?.nextSibling?.textContent).toBe(' after');
    expect(document.querySelector('input[name="message"]')).toHaveValue('before  after');
    await waitFor(() => expect(editor).toHaveFocus());
    expect(editorCaretOffset(editor)).toBe('before '.length);
  });

  it('opens and replaces the mention under the caret in the middle of a draft', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();
    const editor = composerEditor();

    await user.type(editor, 'before @plot after');
    expect(editor).toHaveAttribute('aria-expanded', 'false');

    placeCaret(editor, 'before @plot'.length);
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));

    const chip = await screen.findByRole('button', { name: 'Open artifact Displacement plot' });
    const token = chip.closest('[data-reference-token]');
    expect(token?.previousSibling?.textContent).toBe('before ');
    expect(token?.nextSibling?.textContent).toBe(' after');
    expect(document.querySelector('input[name="message"]')).toHaveValue('before  after');
  });

  it('keeps the caret where an inline reference is removed', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();
    const editor = composerEditor();

    await user.type(editor, 'before @plot after');
    placeCaret(editor, 'before @plot'.length);
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));
    await user.click(screen.getByRole('button', { name: 'Remove Displacement plot' }));

    await waitFor(() => expect(editor).toHaveFocus());
    expect(editorCaretOffset(editor)).toBe('before '.length);
    expect(document.querySelector('input[name="message"]')).toHaveValue('before  after');
  });

  it('replaces the whole typed query when the query itself contains an @', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();

    await user.type(composerEditor(), '@foo@bar');
    await screen.findByRole('option', { name: /Displacement plot/ });
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('button', { name: 'Open artifact Displacement plot' }),
    ).toBeVisible();
    expect(document.querySelector('input[name="message"]')).toHaveValue(' ');
  });

  it('keeps the typed query when the chosen reference is already in the draft', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();
    const editor = composerEditor();

    await user.type(editor, '@plot');
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));
    await screen.findByRole('button', { name: 'Open artifact Displacement plot' });

    await user.type(editor, '@plot');
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));

    // Nothing was added, so nothing the person typed is consumed either.
    expect(document.querySelector('input[name="message"]')).toHaveValue(' @plot');
    expect(screen.getAllByRole('button', { name: 'Open artifact Displacement plot' })).toHaveLength(
      1,
    );
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
