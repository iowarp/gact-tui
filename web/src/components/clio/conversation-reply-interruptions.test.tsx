import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it.each([
    ['without content', []],
    ['after a partial answer', [{ id: 'part_partial', type: 'text', text: 'The first half' }]],
  ])('says a reply the service stopped was interrupted, %s', (_label, blocks) => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_service_stopped',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-11-15T23:02:00Z',
            blocks: blocks as never,
            stop_reason: 'cancelled',
            error_info: {
              error: 'cancelled',
              message: 'turn cancelled by server shutdown',
              details: { reason: 'server_shutdown', session_id: 'session_1' },
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

    // CC-F2: not "Reply cancelled" (the person did not cancel it), and a reason.
    expect(screen.getByText('This reply was interrupted')).toBeInTheDocument();
    expect(
      screen.getByText(/agent service stopped before this reply finished/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Reply cancelled')).not.toBeInTheDocument();
    expect(screen.queryByText(/turn cancelled by server shutdown/)).not.toBeInTheDocument();
  });

  it.each([
    ['a restart', 'server_restart_interrupted', {}],
    ['a stop', 'cancelled', { reason: 'server_shutdown' }],
  ])(
    'offers no Retry on a reply %s already resumed, and says where it continued',
    (_l, error, details) => {
      const onRetryMessage = vi.fn();
      renderConversation(
        <ClioConversation
          artifacts={{}}
          messages={[
            {
              id: 'message_cut',
              session_id: 'session_1',
              role: 'assistant',
              run_id: 'msg_user_cut',
              created_at: '2026-11-16T00:27:44Z',
              blocks: [],
              stop_reason: 'error',
              error_info: { error, message: 'interrupted', details, recoverable: true },
            },
            {
              id: 'message_resumed',
              session_id: 'session_1',
              role: 'assistant',
              run_id: 'turn_recovery',
              created_at: '2026-11-16T00:28:12Z',
              blocks: [{ id: 'answer', type: 'text', text: 'Running it again.' }] as never,
              stop_reason: 'end_turn',
              metadata: { resumes_turn: 'msg_user_cut' },
            },
          ]}
          onRetryMessage={onRetryMessage}
          subagents={{}}
          surfaces={{}}
          tasks={{}}
          tools={{}}
        />,
      );

      // CC-O1: the restart already resumed this work; Retry would ask again.
      expect(screen.getByText('This reply was interrupted')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument();
      const where = screen.getByRole('button', { name: 'Show where it continued' });
      const continued = document.querySelector<HTMLElement>('[data-message-id="message_resumed"]');
      expect(continued).not.toBeNull();
      const scrolled = vi.fn();
      continued!.scrollIntoView = scrolled;
      fireEvent.click(where);
      expect(scrolled).toHaveBeenCalled();
      expect(onRetryMessage).not.toHaveBeenCalled();
    },
  );

  it('keeps Retry on an interrupted reply nothing resumed', () => {
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_cut',
            session_id: 'session_1',
            role: 'assistant',
            run_id: 'msg_user_cut',
            created_at: '2026-11-16T00:27:44Z',
            blocks: [],
            stop_reason: 'error',
            error_info: { error: 'server_restart_interrupted', message: 'x', recoverable: true },
          },
        ]}
        onRetryMessage={() => undefined}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Show where it continued' })).toBeNull();
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
