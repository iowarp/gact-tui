import type { AttentionAvailable, Message } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TRANSCRIPT_PREVIEW_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { ClioTranscriptOutline } from './transcript-outline';

const virtual = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: estimateSize(),
        start: index * estimateSize(),
      })),
    scrollToIndex: virtual.scrollToIndex,
  }),
}));

afterEach(() => {
  cleanup();
  virtual.scrollToIndex.mockClear();
  vi.restoreAllMocks();
});

const messages: Message[] = [
  {
    id: 'user_1',
    session_id: 'session_1',
    role: 'user',
    created_at: '2026-08-31T12:00:00Z',
    blocks: [
      {
        id: 'text_1',
        type: 'text',
        text: 'Compare the **three stations** with the complete provenance record.',
      },
    ],
  },
  {
    id: 'assistant_1',
    session_id: 'session_1',
    role: 'assistant',
    created_at: '2026-08-31T12:00:01Z',
    blocks: [{ id: 'surface_1', type: 'a2ui', surface_id: 'station-map' }],
  },
];

function manyMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `message_${index}`,
    session_id: 'session_1',
    role: 'user' as const,
    created_at: '2026-08-31T12:00:00Z',
    blocks: [{ id: `text_${index}`, type: 'text' as const, text: `Message ${index}` }],
  }));
}

async function openOutline(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open transcript outline' }));
  return screen.getByRole('dialog', { name: 'Transcript outline' });
}

describe('ClioTranscriptOutline', () => {
  it('states each message share of the attention in attention mode', async () => {
    const user = userEvent.setup();
    const block = (message_id: string, share: number) => ({
      message_id,
      part_id: message_id,
      field: 'text',
      kind: 'user_text' as const,
      share,
      mean: 0,
      runs: [],
    });
    const attention = {
      available: true as const,
      message_id: 'message_2',
      selection: { text: 'x' },
      residual: 0.5,
      sources: [],
      flags: [],
      blocks: [block('message_0', 0.49), block('message_1', 0.01)],
    } as AttentionAvailable;
    render(
      <ClioTranscriptOutline
        activeIndex={2}
        attention={attention}
        messages={manyMessages(3)}
        onJump={vi.fn()}
      />,
      { wrapper: TooltipProvider },
    );
    await user.click(
      screen.getByRole('button', { name: 'Open transcript outline with attention' }),
    );
    const outline = within(screen.getByRole('dialog', { name: 'Transcript outline' }));
    const heated = outline.getByRole('button', {
      name: 'Jump to user message 1, 98.0% of attention',
    });
    expect(heated).toHaveAttribute('data-heat');
    expect(within(heated).getByText('98.0%')).toHaveClass('text-chart-5');
    const cool = outline.getByRole('button', { name: 'Jump to user message 2, 2.0% of attention' });
    expect(cool).not.toHaveAttribute('data-heat');
    expect(within(cool).getByText('2.0%')).not.toHaveClass('text-chart-5');
    expect(outline.getByRole('button', { name: 'Jump to user message 3' })).toBeInTheDocument();
  });
  it('marks through a hover preview without jumping, and jumps to the original index in the marked list', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const onMarkMessage = vi.fn().mockResolvedValue(undefined);
    const props = { activeIndex: 0, messages: manyMessages(5), onJump, onMarkMessage };
    const { rerender } = render(<ClioTranscriptOutline {...props} />, {
      wrapper: TooltipProvider,
    });
    const outline = within(await openOutline(user));
    await user.hover(outline.getByRole('button', { name: 'Jump to user message 4' }));
    const preview = await screen.findByRole('region', { name: 'user message 4 preview' });
    await user.click(within(preview).getByRole('button', { name: 'Mark message' }));
    expect(onMarkMessage).toHaveBeenCalledWith('message_3', true);
    expect(onJump).not.toHaveBeenCalled();
    rerender(<ClioTranscriptOutline {...props} markedMessageIds={new Set(['message_3'])} />);
    await user.unhover(preview);
    await user.click(outline.getByRole('button', { name: 'Marked (1)' }));
    const list = within(screen.getByRole('dialog', { name: 'Transcript outline' }));
    expect(
      list.queryByRole('button', { name: /Jump to user message 1\b/ }),
    ).not.toBeInTheDocument();
    await user.click(list.getByRole('button', { name: 'Jump to user message 4, marked' }));
    expect(onJump).toHaveBeenCalledWith(3);
  });

  it('lists every message as one compact outline line', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(<ClioTranscriptOutline activeIndex={0} messages={messages} onJump={onJump} />);

    const outline = within(await openOutline(user));
    const title = await outline.findByText(
      'Compare the three stations with the complete provenance record.',
      {},
      { timeout: 15_000 },
    );
    expect(title).toBeVisible();
    const outlineItem = outline.getByRole('button', { name: 'Jump to user message 1' });
    // One 28px ListRow line per message, the current one named in words.
    expect(outlineItem).toHaveAttribute('data-slot', 'transcript-outline-row');
    expect(outlineItem).toContainElement(title);
    expect(outlineItem).toHaveAttribute('aria-current', 'location');
    expect(outlineItem).toHaveTextContent('Here');
    expect(outlineItem.parentElement).toHaveStyle({ height: '56px' });
    // A message without text still has a name, never a blank slot.
    expect(outline.getByRole('button', { name: 'Jump to assistant message 2' })).toHaveTextContent(
      'Visual result',
    );
    expect(outline.queryByText(/\*\*three stations\*\*/)).not.toBeInTheDocument();
    await user.hover(outlineItem);
    const preview = await screen.findByRole('region', { name: 'user message 1 preview' });
    expect(preview).toHaveTextContent(
      'Compare the three stations with the complete provenance record.',
    );
    await user.click(outlineItem);
    expect(onJump).toHaveBeenCalledWith(0);
    expect(
      screen.queryByRole('region', { name: 'user message 1 preview' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Transcript outline' })).not.toBeInTheDocument();
  });

  it('caps a long message before it reaches the preview renderer', async () => {
    const user = userEvent.setup();
    const long = 'ground truth '.repeat(400);
    render(
      <ClioTranscriptOutline
        activeIndex={0}
        messages={[
          {
            id: 'user_long',
            session_id: 'session_1',
            role: 'user',
            created_at: '2026-08-31T12:00:00Z',
            blocks: [{ id: 'text_long', type: 'text', text: long }],
          },
        ]}
        onJump={vi.fn()}
      />,
    );

    const outline = within(await openOutline(user));
    await user.hover(outline.getByRole('button', { name: 'Jump to user message 1' }));
    const preview = await screen.findByRole('region', { name: 'user message 1 preview' });
    const rendered = preview.textContent ?? '';
    expect(rendered.length).toBeLessThanOrEqual(
      TRANSCRIPT_PREVIEW_TRUNCATE_CHARS + 'user'.length + 1,
    );
    expect(rendered).toContain('…');
  });

  it('falls back to reasoning only when a message carries no text', async () => {
    const user = userEvent.setup();
    render(
      <ClioTranscriptOutline
        activeIndex={0}
        messages={[
          {
            id: 'assistant_both',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-31T12:00:00Z',
            blocks: [
              { id: 'reasoning_both', type: 'reasoning', text: 'Private deliberation.' },
              { id: 'text_both', type: 'text', text: 'The published answer.' },
            ],
          },
          {
            id: 'assistant_only_reasoning',
            session_id: 'session_1',
            role: 'assistant',
            created_at: '2026-08-31T12:00:01Z',
            blocks: [{ id: 'reasoning_only', type: 'reasoning', text: 'Still deliberating here.' }],
          },
        ]}
        onJump={vi.fn()}
      />,
    );

    const outline = within(await openOutline(user));
    await user.hover(outline.getByRole('button', { name: 'Jump to assistant message 1' }));
    const withText = await screen.findByRole('region', { name: 'assistant message 1 preview' });
    expect(withText).toHaveTextContent('The published answer.');
    expect(withText).not.toHaveTextContent('Private deliberation.');

    await user.unhover(outline.getByRole('button', { name: 'Jump to assistant message 1' }));
    await user.hover(outline.getByRole('button', { name: 'Jump to assistant message 2' }));
    const reasoningOnly = await screen.findByRole('region', {
      name: 'assistant message 2 preview',
    });
    expect(reasoningOnly).toHaveTextContent('Still deliberating here.');
  });
});
