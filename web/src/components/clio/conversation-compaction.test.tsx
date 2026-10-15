import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { A2UISurface, Message, PendingCompaction, PendingInteraction } from '@clio/core/v3';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ClioConversation } from './conversation';

// Compaction rendering gets its own file rather than adding to
// `conversation.test.tsx`, which is already at the frontend file-size cap.

const virtualizerMocks = vi.hoisted(() => ({ scrollToIndex: vi.fn() }));

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        end: (index + 1) * 180,
        index,
        key: index,
        size: 180,
        start: index * 180,
      })),
    measureElement: () => undefined,
    measure: () => undefined,
    scrollToIndex: virtualizerMocks.scrollToIndex,
  }),
}));

// The surface renderer is out of scope here: these tests count how many times
// the transcript mounts a surface, so it stands in as one tagged element.
vi.mock('./a2ui-surface', () => ({
  ClioA2UISurface: ({ surface }: { surface: A2UISurface }) => (
    <section data-slot="test-a2ui-surface" data-surface-id={surface.id} />
  ),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  virtualizerMocks.scrollToIndex.mockClear();
  window.history.replaceState(null, '', window.location.pathname);
});

function renderConversation(element: ReactElement) {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}

const summary =
  'The agent read three workspace files and summarized their contents before continuing. ' +
  'Every archived message stays retrievable through the export path. ' +
  'The exact summary remains available behind its disclosure, unique-marker-tail.';

type InjectionBlock = Extract<Message['blocks'][number], { type: 'injection' }>;

const summaryBlock: InjectionBlock = {
  id: 'part_summary',
  type: 'injection',
  source: 'summarization',
  text: summary,
  trigger: 'auto',
  compaction_id: 'cmp_1',
};

/** A between-turns summary exactly as the service returns it on reload. */
const summaryMessage: Message = {
  id: 'message_summary',
  session_id: 'session_1',
  role: 'assistant',
  created_at: '2026-10-01T00:00:02Z',
  blocks: [summaryBlock],
};

const userMessage: Message = {
  id: 'message_user',
  session_id: 'session_1',
  role: 'user',
  created_at: '2026-10-01T00:00:00Z',
  blocks: [{ id: 'user_text', type: 'text', text: 'Analyse the station data' }],
};

const assistantMessage: Message = {
  id: 'message_assistant',
  session_id: 'session_1',
  role: 'assistant',
  turn_id: 'turn_1',
  created_at: '2026-10-01T00:00:01Z',
  blocks: [{ id: 'assistant_text', type: 'text', text: 'Reading the station files now.' }],
};

const noticeBlock: Extract<Message['blocks'][number], { type: 'notice' }> = {
  id: 'part_notice',
  type: 'notice',
  source: 'compaction_failed',
  text: 'No language model is bound.',
  code: 'compaction_unavailable',
  trigger: 'manual',
  compaction_id: 'cmp_live',
};

/** A between-turns failure notice exactly as the service returns it on reload. */
const noticeMessage: Message = {
  id: 'msg_notice_ab12',
  session_id: 'session_1',
  role: 'assistant',
  created_at: '2026-10-01T00:00:04Z',
  blocks: [noticeBlock],
};

function pending(overrides: Partial<PendingCompaction> = {}): PendingCompaction {
  return {
    compaction_id: 'cmp_live',
    session_id: 'session_1',
    scope: 'main',
    trigger: 'auto',
    turn_id: 'turn_1',
    anchor_message_id: 'message_assistant',
    status: 'running',
    started_at: '2026-10-01T00:00:03Z',
    ...overrides,
  };
}

function conversation(
  messages: Message[],
  compactions?: PendingCompaction[],
  {
    interactions,
    surfaces = {},
    expandActivity = true,
  }: {
    interactions?: PendingInteraction[];
    surfaces?: Record<string, A2UISurface>;
    expandActivity?: boolean;
  } = {},
) {
  const view = renderConversation(
    <ClioConversation
      artifacts={{}}
      compactions={compactions}
      interactions={interactions}
      messages={messages}
      subagents={{}}
      surfaces={surfaces}
      tasks={{}}
      tools={{}}
    />,
  );
  // Content and ownership checks inspect the disclosure the user opens.
  // The default-state test opts out and verifies the collapsed experience.
  if (expandActivity) {
    for (const button of screen.queryAllByRole('button', { name: /^Activity:/u })) {
      if (button.getAttribute('aria-expanded') === 'false') fireEvent.click(button);
    }
  }
  return view;
}

function progressRow(): HTMLElement | null {
  return document.querySelector('[data-slot="compaction-progress"]');
}

describe('ClioConversation summarization injection', () => {
  it('keeps a reloaded summary inside Activity and discloses its exact text', async () => {
    const user = userEvent.setup();
    conversation([userMessage, summaryMessage], undefined, { expandActivity: false });

    expect(
      document.querySelector('[data-slot="harness-injection"][data-source="summarization"]'),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Activity:/u }));
    expect(screen.getByText('Summarization')).toBeInTheDocument();
    expect(screen.getByText('Automatic')).toBeInTheDocument();
    expect(screen.queryByText(/unique-marker-tail/u)).not.toBeInTheDocument();

    const disclosure = screen.getByRole('button', { name: /Injection Summarization/u });
    await user.click(disclosure);
    expect(screen.getByText(/unique-marker-tail/u).textContent).toBe(summary);
    await user.click(disclosure);
    expect(screen.queryByText(/unique-marker-tail/u)).not.toBeInTheDocument();
  });

  it('renders a mid-turn summary inside the turn, before the work that followed it', () => {
    conversation([
      userMessage,
      {
        ...assistantMessage,
        blocks: [
          { id: 'r1', type: 'reasoning', text: 'Read the station files.' },
          summaryBlock,
          { id: 'r2', type: 'reasoning', text: 'Fit the displacement series.' },
          { id: 'answer', type: 'text', text: 'Final answer text.', channel: 'answer' },
        ],
      },
    ]);
    const row = document.querySelector('[data-source="summarization"]');
    expect(document.getElementById('message-message_assistant')?.contains(row)).toBe(true);
    expect(document.querySelectorAll('[data-source="summarization"]')).toHaveLength(1);
    expect(
      row!.compareDocumentPosition(screen.getByText('Final answer text.')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the trailing recall line as part of the summary text', async () => {
    const user = userEvent.setup();
    const recall = 'Earlier detail is archived; call recall_context to retrieve it.';
    conversation([
      { ...summaryMessage, blocks: [{ ...summaryBlock, text: `${summary}\n\n${recall}` }] },
    ]);
    expect(screen.queryByText(/unique-marker-tail/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Injection Summarization/u }));
    expect(screen.getByText(/call recall_context to retrieve it/u).textContent).toBe(
      `${summary}\n\n${recall}`,
    );
  });

  it('labels a user-requested summary distinctly from an automatic one', () => {
    conversation([
      {
        ...summaryMessage,
        blocks: [{ ...summaryBlock, text: 'Short summary.', trigger: 'manual' }],
      },
    ]);
    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.queryByText('Automatic')).not.toBeInTheDocument();
  });
});

describe('ClioConversation compaction progress', () => {
  it('shows a running compaction in place after the open turn, badged Automatic', () => {
    conversation([userMessage, assistantMessage], [pending()]);

    const row = progressRow();
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute('role', 'status');
    expect(row).toHaveTextContent('Summarizing context');
    expect(row).toHaveTextContent('Automatic');
    // In place: inside the open turn's assistant message, after its content.
    expect(document.getElementById('message-message_assistant')?.contains(row)).toBe(true);
    expect(
      screen.getByText('Reading the station files now.').compareDocumentPosition(row!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('badges a user-requested compaction as Requested', () => {
    conversation([userMessage, assistantMessage], [pending({ trigger: 'manual' })]);
    expect(progressRow()).toHaveTextContent('Requested');
    expect(progressRow()).not.toHaveTextContent('Automatic');
  });

  it('replaces the shimmer with the summary once the summary block is in the transcript', () => {
    conversation(
      [userMessage, assistantMessage, summaryMessage],
      [
        pending({
          compaction_id: 'cmp_unlisted',
          status: 'completing',
          message_id: 'message_summary',
          part_id: 'part_summary',
        }),
      ],
    );
    expect(progressRow()).toBeNull();
    expect(screen.getByText('Summarization')).toBeInTheDocument();
  });

  it('shows the typed error in place of the shimmer when the compaction fails', () => {
    conversation(
      [userMessage, assistantMessage],
      [
        pending({
          status: 'failed',
          error: { code: 'compaction_unavailable', message: 'No language model is bound.' },
        }),
      ],
    );
    expect(progressRow()).toBeNull();
    const failure = document.querySelector('[data-slot="compaction-failed"]');
    expect(failure).toHaveTextContent('Context could not be summarized');
    expect(failure).toHaveTextContent('No language model is bound.');
    expect(failure).toHaveTextContent('Compaction unavailable');
    expect(document.getElementById('message-message_assistant')?.contains(failure)).toBe(true);
  });

  it('renders a reloaded failure notice with the in-place error look', () => {
    conversation([userMessage, assistantMessage, noticeMessage]);
    const failure = document.querySelector('[data-slot="compaction-failed"]');
    expect(failure).toHaveTextContent('Context could not be summarized');
    expect(failure).toHaveTextContent('No language model is bound.');
    expect(failure).toHaveTextContent('Compaction unavailable');
    expect(failure).toHaveTextContent('Requested');
    expect(document.getElementById('message-msg_notice_ab12')?.contains(failure)).toBe(true);
  });

  it('renders a mid-turn failure notice inside the turn, at its step', () => {
    conversation([
      userMessage,
      {
        ...assistantMessage,
        blocks: [
          { id: 'r1', type: 'reasoning', text: 'Read the station files.' },
          { ...noticeBlock, trigger: 'auto' },
          { id: 'answer', type: 'text', text: 'Final answer text.', channel: 'answer' },
        ],
      },
    ]);
    const failure = document.querySelector('[data-slot="compaction-failed"]');
    expect(failure).toHaveTextContent('Automatic');
    expect(document.getElementById('message-message_assistant')?.contains(failure)).toBe(true);
    expect(
      failure!.compareDocumentPosition(screen.getByText('Final answer text.')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('drops the live failure row once its notice is in the transcript', () => {
    conversation(
      [userMessage, assistantMessage, noticeMessage],
      [
        pending({
          compaction_id: 'cmp_unlisted',
          status: 'failed',
          part_id: 'part_notice',
          error: { code: 'compaction_unavailable', message: 'No language model is bound.' },
        }),
      ],
    );
    // Exactly one failure: the transcript's notice, not the live row as well.
    expect(document.querySelectorAll('[data-slot="compaction-failed"]')).toHaveLength(1);
    expect(
      document
        .getElementById('message-msg_notice_ab12')
        ?.contains(document.querySelector('[data-slot="compaction-failed"]')),
    ).toBe(true);
  });

  it('keeps the live failure row when the service could not record the failure', () => {
    conversation(
      [userMessage, assistantMessage],
      [
        pending({
          status: 'failed',
          error: { code: 'compaction_failure_unrecorded', message: 'Disk is full.' },
        }),
      ],
    );
    expect(document.querySelector('[data-slot="compaction-failed"]')).toHaveTextContent(
      'Disk is full.',
    );
  });

  it('places a compaction with no resident anchor after the last message', () => {
    conversation([userMessage], [pending({ anchor_message_id: undefined, turn_id: '' })]);
    expect(document.querySelector('[data-slot="trailing-compactions"]')).toHaveTextContent(
      'Summarizing context',
    );
  });
});

function mapSurface(id: string): A2UISurface {
  return {
    id,
    session_id: 'session_1',
    catalog_id: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    messages: [],
  };
}

function pendingSurfaceResponse(surfaceId: string): PendingInteraction {
  return {
    id: `a2ui:session_1:${surfaceId}`,
    kind: 'a2ui',
    owner_session_id: 'session_1',
    attended_session_id: 'session_1',
    status: 'pending',
    title: 'Choose an EarthScope station',
    source: { protocol: 'native', surface_id: surfaceId },
    created_at: '2026-10-01T00:00:05Z',
  };
}

function mountedSurfaces(surfaceId: string): Element[] {
  return [
    ...document.querySelectorAll(`[data-slot="test-a2ui-surface"][data-surface-id="${surfaceId}"]`),
  ];
}

describe('ClioConversation renders each block once', () => {
  it('renders a turn with an A2UI surface and a mid-turn summary once each', () => {
    conversation(
      [
        userMessage,
        {
          ...assistantMessage,
          blocks: [
            { id: 'r1', type: 'reasoning', text: 'Read the station files.' },
            summaryBlock,
            { id: 'r2', type: 'reasoning', text: 'Mapped the nearest stations.' },
            { id: 'map_block', type: 'a2ui', surface_id: 'surface_map' },
            { id: 'answer', type: 'text', text: 'Final answer text.', channel: 'answer' },
          ],
        },
      ],
      undefined,
      { surfaces: { surface_map: mapSurface('surface_map') } },
    );
    const [surface, ...duplicates] = mountedSurfaces('surface_map');
    expect(surface).toBeDefined();
    expect(duplicates).toHaveLength(0);
    expect(document.getElementById('message-message_assistant')?.contains(surface!)).toBe(true);
    expect(document.querySelectorAll('[data-source="summarization"]')).toHaveLength(1);
    expect(screen.getAllByText('Final answer text.')).toHaveLength(1);
  });

  it('keeps a detached actionable surface in the transcript while a response is pending', () => {
    conversation([userMessage, { ...assistantMessage, blocks: [summaryBlock] }], undefined, {
      interactions: [pendingSurfaceResponse('surface_map')],
      surfaces: { surface_map: mapSurface('surface_map') },
    });
    expect(mountedSurfaces('surface_map')).toHaveLength(1);
    expect(document.querySelectorAll('[data-source="summarization"]')).toHaveLength(1);
  });

  it('renders a detached surface once when no pending response owns it', () => {
    conversation([userMessage, assistantMessage], undefined, {
      surfaces: { surface_map: mapSurface('surface_map') },
    });
    expect(mountedSurfaces('surface_map')).toHaveLength(1);
  });
});
