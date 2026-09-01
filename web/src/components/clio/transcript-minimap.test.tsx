import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioTranscriptMinimap } from './transcript-minimap';

const { getOffsetForIndex } = vi.hoisted(() => ({
  getOffsetForIndex: vi.fn(() => [17, 'center'] as const),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 11,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 11 })),
    getOffsetForIndex,
  }),
}));

afterEach(() => {
  cleanup();
  getOffsetForIndex.mockClear();
  vi.restoreAllMocks();
});

const messages: Message[] = [
  {
    id: 'user_1',
    session_id: 'session_1',
    role: 'user',
    created_at: '2026-08-31T12:00:00Z',
    blocks: [{ id: 'text_1', type: 'text', text: 'Compare the three stations.' }],
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
    await user.click(screen.getByRole('button', { name: 'Compare the three stations.' }));
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('renders semantic landmark buttons without transcript text duplication', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    const user = userEvent.setup();
    const onJump = vi.fn();
    render(
      <ClioTranscriptMinimap
        activeIndex={1}
        messages={messages}
        onActiveIndexChange={vi.fn()}
        onJump={onJump}
        scrollTargetRef={createRef<HTMLDivElement>()}
        useScrollspy={false}
        visible
      />,
    );

    expect(screen.getByLabelText('Transcript minimap')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Jump to assistant message 2' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('button', { name: 'Jump to user message 1' })).not.toHaveAttribute(
      'aria-current',
    );
    await user.click(screen.getByRole('button', { name: 'Jump to assistant message 2' }));
    expect(onJump).toHaveBeenCalledWith(1);
    expect(screen.queryByText('Compare the three stations.')).not.toBeInTheDocument();
    expect(getOffsetForIndex).not.toHaveBeenCalled();
  });

  it('centers the active landmark when the minimap overflows', () => {
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

    expect(getOffsetForIndex).toHaveBeenCalledWith(1, 'center');
    expect(screen.getByLabelText('Transcript minimap').firstElementChild).toHaveProperty(
      'scrollTop',
      17,
    );
  });
});
