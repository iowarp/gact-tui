import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioComposerAnnotations } from './composer-annotations';
import { ClioSelectionActionToolbar, SelectionActionsProvider } from './selection-actions';
import { useAddToChatSelectionAction } from '@/hooks/use-add-to-chat-selection-action';
import { useSelectionComment } from '@/hooks/use-selection-action-file';
import { KeyPlatformContext } from '@/lib/shortcuts/hooks';
import type { CommentAttachment } from '@clio/core/v3';

const commentSession = vi.hoisted(() => ({
  current: undefined as
    | { open: boolean; start: ReturnType<typeof vi.fn>; addMark: ReturnType<typeof vi.fn> }
    | undefined,
}));

vi.mock('@/components/clio/comments/comment-session', () => ({
  useCommentSession: () => commentSession.current,
}));

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  commentSession.current = undefined;
  cleanup();
});

function Page() {
  const [annotations, setAnnotations] = useState<readonly CommentAttachment[]>([]);
  const [focused, setFocused] = useState(0);
  useAddToChatSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () =>
    setFocused((count) => count + 1),
  );
  return (
    <>
      <div data-message-id="msg_1" data-selection-surface="agent-answer" data-session-id="sess_1">
        <div data-slot="message-text">
          <p data-testid="answer">A familiar plate format with a brighter, tangy flavor.</p>
        </div>
      </div>
      <ClioComposerAnnotations annotations={annotations} onChange={setAnnotations} />
      <output data-testid="focus">{focused}</output>
    </>
  );
}

async function selectAnswerText(start: number, end: number) {
  const node = screen.getByTestId('answer').firstChild!;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

describe('selection actions on an agent answer', () => {
  it('Add to chat quotes the selection into the composer and focuses it', async () => {
    const user = userEvent.setup();
    render(
      <SelectionActionsProvider>
        <Page />
        <ClioSelectionActionToolbar />
      </SelectionActionsProvider>,
    );

    expect(screen.queryByRole('toolbar', { name: 'Selection actions' })).not.toBeInTheDocument();
    await selectAnswerText(31, 46);

    const toolbar = screen.getByRole('toolbar', { name: 'Selection actions' });
    await user.click(screen.getByRole('button', { name: 'Add to chat' }));

    expect(toolbar).not.toBeInTheDocument();
    const attached = screen.getByRole('list', { name: 'Attached comments' });
    expect(attached).toHaveTextContent('Comment on an answer');
    expect(attached).toHaveTextContent('brighter, tangy');
    expect(screen.getByTestId('focus')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Remove comment on an answer' }));
    expect(screen.queryByRole('list', { name: 'Attached comments' })).not.toBeInTheDocument();
  });

  it('is reachable from the keyboard: Shift+F10 focuses the menu, Enter runs an action', async () => {
    const user = userEvent.setup();
    render(
      <SelectionActionsProvider>
        <Page />
        <ClioSelectionActionToolbar />
      </SelectionActionsProvider>,
    );
    await selectAnswerText(31, 46);

    // fireEvent, not user.keyboard: user-event re-homes the document selection
    // onto the focused element on every key, which a real browser does not do
    // for a non-editable caret-browsing selection.
    fireEvent.keyDown(document, { key: 'F10', shiftKey: true });
    await act(async () => {
      fireEvent(document, new Event('selectionchange'));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    const addToChat = screen.getByRole('button', { name: 'Add to chat' });
    expect(addToChat).toHaveFocus();
    expect(screen.getByRole('toolbar', { name: 'Selection actions' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Shift+F10',
    );
    await user.keyboard('{Enter}');

    expect(screen.getByRole('list', { name: 'Attached comments' })).toHaveTextContent(
      'brighter, tangy',
    );
  });

  it('Escape in the menu dismisses it and clears the selection', async () => {
    const user = userEvent.setup();
    render(
      <SelectionActionsProvider>
        <Page />
        <ClioSelectionActionToolbar />
      </SelectionActionsProvider>,
    );
    await selectAnswerText(31, 46);
    fireEvent.keyDown(document, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Add to chat' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('toolbar', { name: 'Selection actions' })).not.toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe('');
  });
});

function FilePage({ comments = false }: { comments?: boolean }) {
  const [annotations, setAnnotations] = useState<readonly CommentAttachment[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useAddToChatSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () => {});
  return (
    <>
      <div
        data-file-path="ndp/soil_sites.csv"
        data-selection-surface="file"
        data-workspace-id="ws_1"
        ref={setHost}
      >
        <div data-line="3">
          <span data-testid="line-3">MTA1,35.1,-97.2</span>
        </div>
        <div data-line="4">
          <span data-testid="line-4">MTA2,35.4,-97.9</span>
        </div>
      </div>
      {comments ? <SelectionCommentHost host={host} /> : null}
      <ClioComposerAnnotations annotations={annotations} onChange={setAnnotations} />
    </>
  );
}

function SelectionCommentHost({ host }: { host: HTMLElement | null }) {
  useSelectionComment(host, 'ndp/soil_sites.csv');
  return null;
}

async function selectFileLines() {
  const range = document.createRange();
  range.setStart(screen.getByTestId('line-3').firstChild!, 0);
  range.setEnd(screen.getByTestId('line-4').firstChild!, 4);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

function renderFilePage(platform: 'mac' | 'windows' = 'mac', comments = false) {
  return render(
    <KeyPlatformContext.Provider value={platform}>
      <SelectionActionsProvider>
        <FilePage comments={comments} />
        <ClioSelectionActionToolbar />
      </SelectionActionsProvider>
    </KeyPlatformContext.Provider>,
  );
}

describe('selection actions on a file viewer', () => {
  it('Add to message quotes the passage with its file', async () => {
    const user = userEvent.setup();
    renderFilePage();
    await selectFileLines();

    expect(screen.getByRole('toolbar', { name: 'Selection actions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comment' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to message' }));

    const attached = screen.getByRole('list', { name: 'Attached comments' });
    expect(attached).toHaveTextContent('ndp/soil_sites.csv');
    expect(attached).toHaveTextContent('MTA1,35.1,-97.2');
  });

  it('shows each action with its Mac key', async () => {
    commentSession.current = { open: false, start: vi.fn(), addMark: vi.fn() };
    renderFilePage('mac', true);
    await selectFileLines();

    const keys = screen
      .getAllByRole('button')
      .flatMap((button) =>
        Array.from(button.querySelectorAll('[data-slot="selection-action-shortcut"]')),
      )
      .map((kbd) => kbd.textContent);
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => key?.includes('⌘'))).toBe(true);
  });

  it('Comment opens the viewer comment session with the selected passage', async () => {
    const user = userEvent.setup();
    const session = { open: false, start: vi.fn(), addMark: vi.fn() };
    commentSession.current = session;
    renderFilePage('mac', true);
    await selectFileLines();

    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(session.start).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(session.addMark).toHaveBeenCalledWith(
        expect.objectContaining({
          exact: expect.stringContaining('MTA1,35.1,-97.2'),
          source_path: 'ndp/soil_sites.csv',
        }),
        expect.anything(),
      ),
    );
  });

  it('answers an action key while the menu is up', async () => {
    renderFilePage('windows');
    await selectFileLines();

    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('list', { name: 'Attached comments' })).toHaveTextContent(
      'ndp/soil_sites.csv',
    );
  });
});
