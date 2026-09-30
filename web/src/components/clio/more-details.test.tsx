import type { Message, TranscriptSnapshot, TransportFrame } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComposerAnnotation } from '@/lib/composer-annotations';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';

const mocks = vi.hoisted(() => ({
  repository: {
    openSideSession: vi.fn(),
    submitMessage: vi.fn(),
    deleteSession: vi.fn(),
    transcript: vi.fn(),
    stream: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => mocks.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 180,
        start: index * 180,
      })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

// Loaded at collection so the lazy Markdown boundary never charges a test.
import '@/components/ai-elements/markdown';
import { ClioMoreDetails } from './more-details';
import { ClioSelectionActionToolbar, SelectionActionsProvider } from './selection-actions';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
  Object.values(mocks.repository).forEach((fn) => fn.mockReset());
});

const aside = {
  id: 'sess_aside',
  workspace_id: 'ws_1',
  title: 'More details: brighter, tangy',
  parent_session_id: 'sess_main',
  state: 'idle',
  created_at: '2026-09-27T10:00:10Z',
  updated_at: '2026-09-27T10:00:10Z',
  pinned: false,
  archived: false,
};

function message(id: string, role: 'user' | 'assistant', text: string, at: string): Message {
  return {
    id,
    session_id: 'sess_aside',
    role,
    created_at: at,
    blocks: [{ id: `${id}_block`, type: 'text', text }],
  } as Message;
}

const snapshot: TranscriptSnapshot = {
  cursor: '5',
  messages: [
    // Copied parent history: context for the aside, never repeated in the panel.
    message(
      'msg_answer',
      'assistant',
      'Salmon cakes with a brighter, tangy dill sauce.',
      '2026-09-27T10:00:00Z',
    ),
    message('msg_q', 'user', '> brighter, tangy\n\nExplain this part.', '2026-09-27T10:00:11Z'),
    message(
      'msg_a',
      'assistant',
      'The tang comes from the capers and Dijon, not lemon.',
      '2026-09-27T10:00:15Z',
    ),
  ],
  tools: [],
  tasks: [],
  subagents: [],
  artifacts: [],
  surfaces: [],
};

function Harness() {
  const [annotations, setAnnotations] = useState<readonly ComposerAnnotation[]>([]);
  return (
    <>
      <div
        data-message-id="msg_answer"
        data-selection-surface="agent-answer"
        data-session-id="sess_main"
      >
        <div data-slot="message-text">
          <p data-testid="answer">Salmon cakes with a brighter, tangy dill sauce.</p>
        </div>
      </div>
      <ClioMoreDetails
        composerDraft={{ annotations, onAnnotationsChange: setAnnotations }}
        focusComposer={() => undefined}
        model="sonnet"
        provider="claude_code"
        sessionId="sess_main"
        workspaceId="ws_1"
      />
      <output data-testid="attached">
        {annotations.map((item) => (item.kind === 'text-quote' ? item.text : '')).join('|')}
      </output>
    </>
  );
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppearanceProvider>
        <ConversationDisplayProvider>
          <SelectionActionsProvider>
            <Harness />
            <ClioSelectionActionToolbar />
          </SelectionActionsProvider>
        </ConversationDisplayProvider>
      </AppearanceProvider>
    </QueryClientProvider>,
  );
}

async function selectAnswerText(start: number, end: number) {
  const node = screen.getByTestId('answer').firstChild!;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

describe('More details', () => {
  it('opens a read-only aside on the selection, shows only its own exchange, and adds an answer to chat on request', async () => {
    const user = userEvent.setup();
    mocks.repository.openSideSession.mockResolvedValue(aside);
    mocks.repository.submitMessage.mockResolvedValue({});
    mocks.repository.deleteSession.mockResolvedValue(undefined);
    mocks.repository.transcript.mockResolvedValue(snapshot);
    mocks.repository.stream.mockImplementation(async function* (
      _scope: unknown,
      _cursor: unknown,
      signal: AbortSignal,
    ): AsyncGenerator<TransportFrame> {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
      // The aside's live stream stays open and quiet until the panel closes.
      yield* [] as TransportFrame[];
    });
    renderHarness();

    await selectAnswerText(20, 35);
    await user.click(screen.getByRole('button', { name: 'More details' }));

    expect(mocks.repository.openSideSession).toHaveBeenCalledWith('sess_main', {
      text: 'brighter, tangy',
      message_id: 'msg_answer',
    });
    await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(1));
    const [asideId, first] = mocks.repository.submitMessage.mock.calls[0]!;
    expect(asideId).toBe('sess_aside');
    expect(first.parts).toEqual([
      {
        type: 'text',
        text: '> brighter, tangy\n\nExplain this part of your answer in more detail.',
      },
    ]);
    expect(first.model).toEqual({ provider_id: 'claude_code', model_id: 'sonnet' });

    const panel = await screen.findByRole('dialog', { name: 'More details' });
    expect(panel).toHaveTextContent('Read-only side conversation');
    expect(panel).toHaveTextContent('Selected text');
    expect(
      await screen.findByText('The tang comes from the capers and Dijon, not lemon.'),
    ).toBeInTheDocument();
    // The copied parent history is context, not part of the aside's exchange.
    const conversation = panel.querySelector('[data-slot="more-details-conversation"]')!;
    expect(conversation).not.toHaveTextContent('Salmon cakes with a brighter');
    // Nothing reached the main chat yet.
    expect(screen.getByTestId('attached')).toHaveTextContent('');

    await user.type(
      screen.getByRole('textbox', { name: 'Ask a follow-up question' }),
      'And without capers?',
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(mocks.repository.submitMessage).toHaveBeenCalledTimes(2));
    expect(mocks.repository.submitMessage.mock.calls[1]![1].parts).toEqual([
      { type: 'text', text: 'And without capers?' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Add answer to chat' }));
    expect(screen.getByTestId('attached')).toHaveTextContent(
      'The tang comes from the capers and Dijon, not lemon.',
    );
    // Adding to chat closes the aside, which deletes it on the service.
    await waitFor(() => expect(mocks.repository.deleteSession).toHaveBeenCalledWith('sess_aside'));
    expect(screen.queryByRole('dialog', { name: 'More details' })).not.toBeInTheDocument();
  });

  it('is not offered on text inside the aside itself', async () => {
    const user = userEvent.setup();
    renderHarness();
    const answer = screen.getByTestId('answer').closest('[data-selection-surface]')!;
    answer.setAttribute('data-session-id', 'sess_aside');
    await selectAnswerText(20, 35);
    expect(screen.queryByRole('button', { name: 'More details' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
  });
});
