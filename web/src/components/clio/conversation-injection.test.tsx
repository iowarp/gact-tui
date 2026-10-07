import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioConversation } from './conversation';

// Harness injections (what CLIO gave the agent) get their own file, like the
// compaction checkpoint: `conversation.test.tsx` is at the file-size cap.

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

describe('ClioConversation harness injection', () => {
  it('shows what the harness gave the agent, expanding to the exact text', async () => {
    const user = userEvent.setup();
    const text =
      "[clio: path_hint]\nargument 'path': 'a.csv' does not exist. Did you mean 'data/a.csv'?";
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_injection',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-29T00:00:00Z',
            blocks: [
              { id: 'inj_1', type: 'injection', source: 'path_hint', text, call_id: 'call_1' },
            ],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText(/gave the agent: Path suggestion/)).toBeInTheDocument();
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show what it got' }));
    expect(screen.getByText(/Did you mean 'data\/a.csv'/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open exact details' }));
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
  });

  it('names an unlisted source plainly', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_injection_2',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-29T00:00:00Z',
            blocks: [{ id: 'inj_2', type: 'injection', source: 'new_fix', text: 'x' }],
          },
        ]}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );
    expect(screen.getByText(/gave the agent: New fix/)).toBeInTheDocument();
  });
});
