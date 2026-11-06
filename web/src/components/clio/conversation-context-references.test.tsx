import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderConversation(element: ReactElement) {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>{element}</ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}

describe('context references in a sent message', () => {
  it('keeps a structured context reference visible and clickable in the sent message', async () => {
    const user = userEvent.setup();
    const onOpenReference = vi.fn();
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_reference',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-09-02T00:00:00Z',
            blocks: [
              {
                id: 'reference_part',
                type: 'context_reference',
                ref_kind: 'workspace_file',
                ref_id: 'README.md',
                label: 'README.md',
                revision: 'sha256:abc',
                media_type: 'text/markdown',
                navigation: { workspace_id: 'workspace_1', path: 'README.md' },
              },
              { id: 'text_part', type: 'text', text: 'Use this as context.' },
            ],
          },
        ]}
        onOpenReference={onOpenReference}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const reference = screen.getByRole('button', { name: 'Open referenced local file README.md' });
    // The kind is named the way a reader would name it, and the addressing
    // revision is not shown as prose anywhere on the card.
    expect(reference).toHaveAttribute('title', 'local file');
    expect(reference).toHaveAttribute('data-reference-revision', 'sha256:abc');
    expect(reference).not.toHaveTextContent('sha256:abc');
    expect(reference).not.toHaveTextContent('·');
    expect(reference.querySelector('svg')).toHaveClass('lucide-file-text');

    await user.click(reference);
    expect(onOpenReference).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workspace_file',
        id: 'README.md',
        detail: '',
        navigation: { workspace_id: 'workspace_1', path: 'README.md' },
      }),
    );
    expect(screen.getByText('Use this as context.')).toBeInTheDocument();
  });

  it('shows a reference where the person typed it, not in a list below the text', async () => {
    const user = userEvent.setup();
    const onOpenReference = vi.fn();
    renderConversation(
      <ClioConversation
        artifacts={{}}
        messages={[
          {
            id: 'message_inline_reference',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-09-02T00:00:00Z',
            blocks: [
              {
                id: 'reference_part',
                type: 'context_reference',
                ref_kind: 'workspace_file',
                ref_id: 'data/run.h5::/entry/frames',
                label: 'run.h5 › /entry/frames',
                revision: 'stat:1:42',
                media_type: 'application/x-hdf5',
                navigation: { path: 'data/run.h5', locator: '/entry/frames' },
              },
              {
                id: 'text_part',
                type: 'text',
                text: 'Plot the frames in @data/run.h5::/entry/frames. What is the peak?',
              },
            ],
          },
        ]}
        onOpenReference={onOpenReference}
        subagents={{}}
        surfaces={{}}
        tasks={{}}
        tools={{}}
      />,
    );

    const text = document.querySelector('[data-slot="message-text"]');
    const references = screen.getAllByRole('button', {
      name: 'Open referenced local file run.h5 › /entry/frames',
    });
    expect(references).toHaveLength(1);
    expect(text).toContainElement(references[0]!);
    expect(text).toHaveTextContent('Plot the frames in run.h5 › /entry/frames. What is the peak?');
    expect(text).not.toHaveTextContent('@data/run.h5');

    await user.click(references[0]!);
    expect(onOpenReference).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'data/run.h5::/entry/frames' }),
    );
  });
});
