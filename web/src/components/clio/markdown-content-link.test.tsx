import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { GroundedMessageResponse } from './grounded-message-response';
import { PresentationNavigation } from './presentation-navigation';

afterEach(() => cleanup());

async function answer(onOpenWebPage?: (url: string, sessionId: string) => void) {
  render(
    <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, sessionId: 'sess_1', onOpenWebPage }}>
      <GroundedMessageResponse mode="static">{'See [the listing](https://arxiv.org/list/cs.DC/new).'}</GroundedMessageResponse>
    </PresentationNavigation.Provider>,
  );
  return screen.findByRole('link', { name: 'the listing' });
}

describe('web links in the conversation', () => {
  it('open in the shared browser on a plain click', async () => {
    const open = vi.fn();
    const link = await answer(open);
    expect(link).toHaveAttribute('title', 'Opens in the shared browser; shift-click opens it outside');
    const clicked = fireEvent.click(link);
    expect(clicked).toBe(false); // the click was taken, not followed
    expect(open).toHaveBeenCalledWith('https://arxiv.org/list/cs.DC/new', 'sess_1');
  });

  it('open outside on shift-click, and outside where there is no shared browser', async () => {
    const open = vi.fn();
    const followed = fireEvent.click(await answer(open), { shiftKey: true });
    expect(followed).toBe(true);
    expect(open).not.toHaveBeenCalled();
    cleanup();
    expect(fireEvent.click(await answer())).toBe(true);
  });
});
