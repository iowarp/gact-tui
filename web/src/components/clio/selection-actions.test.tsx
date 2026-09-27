import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClioComposerAnnotations } from './composer-annotations';
import { ClioSelectionActionToolbar, SelectionActionsProvider } from './selection-actions';
import { useAddToChatSelectionAction } from '@/hooks/use-add-to-chat-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
});

function Page() {
  const [annotations, setAnnotations] = useState<readonly ComposerAnnotation[]>([]);
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
      <ClioComposerAnnotations
        annotations={annotations}
        onRemove={(gone) => setAnnotations(annotations.filter((item) => item !== gone))}
      />
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
    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('Selected text');
    expect(attached).toHaveTextContent('brighter, tangy');
    expect(screen.getByTestId('focus')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Remove selected text 1' }));
    expect(screen.queryByRole('list', { name: 'Attached selections' })).not.toBeInTheDocument();
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

    expect(screen.getByRole('list', { name: 'Attached selections' })).toHaveTextContent(
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
