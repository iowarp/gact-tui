import { cleanup, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ClioConversation } from './conversation';

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
    scrollToIndex: vi.fn(),
  }),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

afterEach(() => {
  cleanup();
});

// How a reply that ended without finishing reads: interrupted by the service (a restart
// or a stop), or cancelled by the person.
function renderConversation(element: ReactElement) {
  return render(
    <LazyMotion features={domAnimation}>
      <AppearanceProvider>
        <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
      </AppearanceProvider>
    </LazyMotion>,
  );
}

describe('ClioConversation reply interruptions', () => {
  it('explains when a response was interrupted by a service restart', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_restart_interrupted',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-11T18:30:23Z',
            blocks: [],
            stop_reason: 'error',
            error_info: {
              error: 'server_restart_interrupted',
              message:
                'The agent service restarted before this response completed. Your request was preserved and can be retried.',
              recoverable: true,
            },
          },
        ]}
        onRetryMessage={() => undefined}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByText('This reply was interrupted')).toBeInTheDocument();
    expect(screen.getByText(/agent service restarted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry response' })).toBeEnabled();
  });

  it('renders a client-cancelled response as one compact line', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_client_cancelled',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-09-22T09:30:00Z',
            blocks: [],
            stop_reason: 'error',
            error_info: {
              error: 'cancelled',
              message: 'turn cancelled by client',
              recoverable: true,
            },
          },
        ]}
        onRetryMessage={() => undefined}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const notice = screen.getByText('Reply cancelled').closest('[data-slot="reply-error"]');
    expect(notice).toHaveClass('w-fit');
    expect(notice).not.toHaveAttribute('title');
    expect(notice?.querySelector('[role="alert"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry response' })).toBeEnabled();
  });
});
