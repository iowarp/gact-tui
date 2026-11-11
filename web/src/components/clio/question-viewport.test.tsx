import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionResponseFrame } from './question-response-frame';
import { SelectionActionsProvider } from './selection-actions';
import { DataReferenceThisButton } from './data-reference-this-button';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { CommentAttachment } from '@clio/core/v3';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

it('closes a question fullscreen view before its reference focuses the composer', async () => {
  const focused = vi.fn();
  function Page() {
    const [annotations, setAnnotations] = useState<readonly CommentAttachment[]>([]);
    useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      focused();
    });
    const interaction = {
      id: 'q',
      kind: 'question',
      owner_session_id: 's',
      attended_session_id: 's',
      status: 'pending',
      title: 'Choose a step',
      source: { protocol: 'native', surface_id: 'diagram' },
      actions: ['answer'],
    } as PendingInteraction;
    return (
      <QuestionResponseFrame
        interaction={interaction}
        showOwner={false}
        onResponse={vi.fn(async () => undefined)}
      >
        <DataReferenceThisButton
          buildReference={() => ({
            title: 'Diagram',
            summary: 'whole view',
            markdown: 'Diagram context',
          })}
        />
      </QuestionResponseFrame>
    );
  }
  render(
    <SelectionActionsProvider>
      <Page />
    </SelectionActionsProvider>,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Open interactive surface full screen' }),
  );
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Reference this' }),
  );
  expect(focused).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('gives native UI questions resize/fullscreen controls without losing their response or remounting the visual', async () => {
  const mounted = vi.fn();
  function VisualQuestion() {
    const [value, setValue] = useState('');
    useEffect(() => {
      mounted();
    }, []);
    return (
      <>
        <p>Question visual</p>
        <textarea
          aria-label="Your answer"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </>
    );
  }
  const interaction = {
    id: 'q',
    kind: 'question',
    owner_session_id: 's',
    attended_session_id: 's',
    status: 'pending',
    title: 'Choose a step',
    prompt: 'Which step?',
    source: { protocol: 'native', surface_id: 'diagram' },
    actions: ['answer', 'cancel'],
  } as PendingInteraction;
  render(
    <QuestionResponseFrame
      interaction={interaction}
      showOwner={false}
      onResponse={vi.fn(async () => undefined)}
    >
      <VisualQuestion />
    </QuestionResponseFrame>,
  );
  await userEvent.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Last step');
  const viewport = screen
    .getByText('Question visual')
    .closest('[data-slot="a2ui-response-viewport"]')!;
  const before = (viewport as HTMLElement).style.height;
  await userEvent.click(screen.getByRole('button', { name: 'Resize interactive surface' }));
  expect((viewport as HTMLElement).style.height).not.toBe(before);
  await userEvent.click(
    screen.getByRole('button', { name: 'Open interactive surface full screen' }),
  );
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('textbox')).toHaveValue('Last step');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));
  expect(screen.getByRole('textbox')).toHaveValue('Last step');
  expect(mounted).toHaveBeenCalledOnce();
  expect(
    screen.getByText('Question visual').closest('[data-response-surface="a2ui"]'),
  ).toHaveAttribute('data-ask-kind', 'question');
});
