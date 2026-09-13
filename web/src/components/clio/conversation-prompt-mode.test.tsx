import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
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

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => cleanup());

function prompt(executionMode: string, text: string): Message {
  return {
    id: `message_${executionMode}`,
    session_id: 'session_1',
    role: 'user',
    created_at: '2026-09-05T00:00:00Z',
    blocks: [{ id: `text_${executionMode}`, type: 'text', text }],
    metadata: { behavior: { execution_mode: executionMode } },
  };
}

it('labels special prompt modes while leaving Execute unmarked', () => {
  render(
    <AppearanceProvider>
      <ConversationDisplayProvider>
        <ClioConversation
          artifacts={{}}
          messages={[
            prompt('plan', 'Plan this comparison.'),
            prompt('deep_research', 'Research this topic.'),
            prompt('execute', 'Run this task.'),
          ]}
          subagents={{}}
          surfaces={{}}
          tasks={{}}
          tools={{}}
        />
      </ConversationDisplayProvider>
    </AppearanceProvider>,
  );

  expect(screen.getByLabelText('Sent in Plan mode')).toHaveTextContent('Plan');
  expect(screen.getByLabelText('Sent in Deep research mode')).toHaveTextContent('Deep research');
  expect(screen.queryByLabelText('Sent in Execute mode')).not.toBeInTheDocument();
  expect(screen.getByText('Run this task.')).toBeInTheDocument();
});
