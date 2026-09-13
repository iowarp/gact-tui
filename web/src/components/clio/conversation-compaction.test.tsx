import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioConversation } from './conversation';

// The compaction checkpoint row (#1339) gets its own file rather than adding
// to `conversation.test.tsx`, which is already at the frontend file-size cap.

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

describe('ClioConversation compaction checkpoint (#1339)', () => {
  it('shows a clamped compaction preview and checkpoint label, expanding to the full summary', async () => {
    const user = userEvent.setup();
    const summary =
      'The agent read three workspace files and summarized their contents before continuing. ' +
      'Every archived message stays retrievable through the export path. ' +
      'This paragraph is long enough that the collapsed preview must clamp instead of showing it all at once, unique-marker-tail.';
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_compaction',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-11T00:00:00Z',
            blocks: [{ id: 'compaction_1', type: 'compaction', summary, auto: true }],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('Context summarized')).toBeInTheDocument();
    expect(screen.getByText('Automatic')).toBeInTheDocument();
    const preview = screen.getByText(/unique-marker-tail/);
    expect(preview).toHaveClass('line-clamp-3');

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText(/unique-marker-tail/)).not.toHaveClass('line-clamp-3');
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('labels a user-requested compaction checkpoint distinctly from an automatic one', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_compaction_requested',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-11T00:00:00Z',
            blocks: [
              { id: 'compaction_2', type: 'compaction', summary: 'Short summary.', auto: false },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.queryByText('Automatic')).not.toBeInTheDocument();
  });
});
