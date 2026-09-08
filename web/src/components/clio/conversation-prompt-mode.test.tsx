import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { ClioConversation } from './conversation';
import { specialMessageExecutionMode } from './conversation-message-projection';

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

it('retains the recorded Plan mode after a transcript round trip', () => {
  const sent = prompt('plan', 'Plan this change before executing it.');
  const reloaded = JSON.parse(JSON.stringify(sent)) as Message;
  expect(specialMessageExecutionMode(reloaded)).toBe('plan');
  expect(
    specialMessageExecutionMode(prompt('execute', 'Now execute the approved plan.')),
  ).toBeUndefined();
  // Later execution must not retroactively relabel the earlier planning prompt.
  expect(specialMessageExecutionMode(reloaded)).toBe('plan');
});

it('does not infer a Plan badge from prose or missing historical metadata', () => {
  const historical = { ...prompt('plan', 'Please plan this change.'), metadata: undefined };
  expect(specialMessageExecutionMode(historical)).toBeUndefined();
  expect(
    specialMessageExecutionMode({ ...prompt('plan', 'Planning.'), role: 'assistant' }),
  ).toBeUndefined();
});
