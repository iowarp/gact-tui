import type { Message } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioTranscriptMinimap } from './transcript-minimap';

const { scrollToIndex } = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 11,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 11 })),
    scrollToIndex,
  }),
}));

afterEach(() => {
  cleanup();
  scrollToIndex.mockClear();
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

describe('ClioTranscriptMinimap', () => {
  it('uses a compact outline on narrow conversations', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(
      <ClioTranscriptMinimap
        activeIndex={0}
        messages={messages}
        onActiveIndexChange={vi.fn()}
        onJump={onJump}
        scrollTargetRef={createRef<HTMLDivElement>()}
        useScrollspy={false}
        visible={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open transcript outline' }));
    const outline = screen.getByRole('dialog', { name: 'Transcript outline' });
    expect(outline).toHaveClass('resize');
    expect(
      await screen.findByText('three stations', { selector: '[data-streamdown="strong"]' }),
    ).toBeVisible();
    const outlineItem = screen.getByRole('button', {
      name: 'Jump to user message 1',
    });
    expect(screen.queryByText(/\*\*three stations\*\*/)).not.toBeInTheDocument();
    await user.hover(outlineItem);
    const fullPreview = await screen.findByRole('region', { name: 'Full user message 1' });
    expect(fullPreview).toHaveTextContent(
      'Compare the three stations with the complete provenance record.',
    );
    await user.click(outlineItem);
    expect(onJump).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('region', { name: 'Full user message 1' })).not.toBeInTheDocument();
  });

  it('renders semantic landmark buttons without transcript text duplication', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const user = userEvent.setup();
    const onJump = vi.fn();
    const parentWheel = vi.fn();
    render(
      <div onWheel={parentWheel}>
        <ClioTranscriptMinimap
          activeIndex={1}
          messages={messages}
          onActiveIndexChange={vi.fn()}
          onJump={onJump}
          scrollTargetRef={createRef<HTMLDivElement>()}
          useScrollspy={false}
          visible
        />
      </div>,
    );

    expect(screen.getByLabelText('Transcript minimap')).toBeVisible();
    expect(screen.getByLabelText('Transcript minimap')).not.toHaveClass(
      'bg-background/80',
      'shadow-sm',
      'backdrop-blur-sm',
    );
    expect(
      screen
        .getByLabelText('Transcript minimap')
        .querySelector('[data-slot="transcript-minimap-landmarks"]'),
    ).toHaveClass('min-h-full', 'items-center');
    const activeLandmark = screen.getByRole('button', { name: 'Jump to assistant message 2' });
    expect(activeLandmark).toHaveAttribute('aria-current', 'location');
    expect(activeLandmark).toHaveClass('h-[11px]');
    expect(activeLandmark.querySelector('[data-slot="transcript-minimap-landmark"]')).toHaveClass(
      'h-1',
      'w-5',
      'opacity-100',
    );
    const inactiveLandmark = screen.getByRole('button', { name: 'Jump to user message 1' });
    expect(inactiveLandmark).not.toHaveAttribute('aria-current');
    expect(inactiveLandmark.querySelector('[data-slot="transcript-minimap-landmark"]')).toHaveClass(
      'opacity-60',
      'group-hover:w-5',
      'group-focus-visible:w-5',
    );
    expect(activeLandmark).not.toHaveClass('ring-2', 'rounded-sm');
    const scrollArea = screen.getByLabelText('Browse transcript landmarks');
    expect(scrollArea).toHaveClass('overscroll-y-contain');
    fireEvent.wheel(scrollArea, { deltaY: 100 });
    expect(parentWheel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Jump to assistant message 2' }));
    expect(onJump).toHaveBeenCalledWith(1);
    expect(screen.queryByText(/Compare the three stations/)).not.toBeInTheDocument();
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it('reveals an edge landmark without forcing it to the center', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(10);
    render(
      <ClioTranscriptMinimap
        activeIndex={1}
        messages={messages}
        onActiveIndexChange={vi.fn()}
        onJump={vi.fn()}
        scrollTargetRef={createRef<HTMLDivElement>()}
        useScrollspy={false}
        visible
      />,
    );

    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: 'end' });
  });
});
