import type { Message } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRANSCRIPT_PREVIEW_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { ClioTranscriptMinimap } from './transcript-minimap';

const virtual = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
  mountedRows: Number.POSITIVE_INFINITY,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 11,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, virtual.mountedRows) }, (_, index) => ({
        index,
        key: index,
        size: 11,
        start: index * 11,
      })),
    scrollToIndex: virtual.scrollToIndex,
  }),
}));

afterEach(() => {
  cleanup();
  virtual.scrollToIndex.mockClear();
  virtual.mountedRows = Number.POSITIVE_INFINITY;
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

describe('ClioTranscriptMinimap', () => {
  // Generous budget: this is the first assertion in the file that waits for the
  // code-split markdown chunk to load.
  it('uses a compact outline on narrow conversations', { timeout: 20_000 }, async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(
      <ClioTranscriptMinimap
        activeIndex={0}
        messages={messages}
        onJump={onJump}
        visible={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open transcript outline' }));
    const outline = within(screen.getByRole('dialog', { name: 'Transcript outline' }));
    expect(
      await outline.findByText(
        'three stations',
        { selector: '[data-streamdown="strong"]' },
        { timeout: 15_000 },
      ),
    ).toBeVisible();
    const outlineItem = outline.getByRole('button', { name: 'Jump to user message 1' });
    expect(outline.queryByText(/\*\*three stations\*\*/)).not.toBeInTheDocument();
    await user.hover(outlineItem);
    const preview = await screen.findByRole('region', { name: 'user message 1 preview' });
    expect(preview).toHaveTextContent(
      'Compare the three stations with the complete provenance record.',
    );
    await user.click(outlineItem);
    expect(onJump).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('region', { name: 'user message 1 preview' })).not.toBeInTheDocument();
  });

  it('offers one landmark per message without repeating transcript prose in the rail', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const user = userEvent.setup();
    const onJump = vi.fn();
    const parentWheel = vi.fn();
    render(
      <div onWheel={parentWheel}>
        <ClioTranscriptMinimap activeIndex={1} messages={messages} onJump={onJump} visible />
      </div>,
    );

    const activeLandmark = screen.getByRole('button', { name: 'Jump to assistant message 2' });
    expect(activeLandmark).toHaveAttribute('aria-current', 'location');
    const inactiveLandmark = screen.getByRole('button', { name: 'Jump to user message 1' });
    expect(inactiveLandmark).not.toHaveAttribute('aria-current');

    expect(screen.queryByText(/Compare the three stations/)).not.toBeInTheDocument();
    await user.hover(inactiveLandmark);
    expect(
      await screen.findByText('three stations', { selector: '[data-streamdown="strong"]' }),
    ).toBeVisible();

    const scrollArea = screen.getByLabelText('Browse transcript landmarks');
    fireEvent.wheel(scrollArea, { deltaY: 100 });
    expect(parentWheel).not.toHaveBeenCalled();

    await user.click(activeLandmark);
    expect(onJump).toHaveBeenCalledWith(1);
    expect(virtual.scrollToIndex).not.toHaveBeenCalled();
  });

  it('reveals an edge landmark without forcing it to the center', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(10);
    render(
      <ClioTranscriptMinimap activeIndex={1} messages={messages} onJump={vi.fn()} visible />,
    );

    expect(virtual.scrollToIndex).toHaveBeenCalledWith(1, { align: 'end' });
  });

  it('reveals an active landmark the rail has not mounted', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(10);
    virtual.mountedRows = 3;

    render(
      <ClioTranscriptMinimap
        activeIndex={7}
        messages={manyMessages(10)}
        onJump={vi.fn()}
        visible
      />,
    );

    expect(screen.getAllByRole('button', { name: /Jump to user message/ })).toHaveLength(3);
    expect(virtual.scrollToIndex).toHaveBeenCalledWith(7, { align: 'auto' });
  });

  it('caps a long message before it reaches the preview renderer', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const long = 'ground truth '.repeat(400);
    render(
      <ClioTranscriptMinimap
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
        visible
      />,
    );

    await user.hover(screen.getByRole('button', { name: 'Jump to user message 1' }));
    const preview = await screen.findByRole('region', { name: 'user message 1 preview' });
    const rendered = preview.textContent ?? '';
    expect(rendered.length).toBeLessThanOrEqual(
      TRANSCRIPT_PREVIEW_TRUNCATE_CHARS + 'user'.length + 1,
    );
    expect(rendered).toContain('…');
  });

  it('falls back to reasoning only when a message carries no text', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    render(
      <ClioTranscriptMinimap
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
            blocks: [
              { id: 'reasoning_only', type: 'reasoning', text: 'Still deliberating here.' },
            ],
          },
        ]}
        onJump={vi.fn()}
        visible
      />,
    );

    await user.hover(screen.getByRole('button', { name: 'Jump to assistant message 1' }));
    const withText = await screen.findByRole('region', { name: 'assistant message 1 preview' });
    expect(withText).toHaveTextContent('The published answer.');
    expect(withText).not.toHaveTextContent('Private deliberation.');

    await user.unhover(screen.getByRole('button', { name: 'Jump to assistant message 1' }));
    await user.hover(screen.getByRole('button', { name: 'Jump to assistant message 2' }));
    const reasoningOnly = await screen.findByRole('region', {
      name: 'assistant message 2 preview',
    });
    expect(reasoningOnly).toHaveTextContent('Still deliberating here.');
  });
});
