import type { CommentAttachment } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameRect } from '../browser-live-input';
import type { BrowserInput } from '../browser-live-socket';
import { BrowserPageComments, type SubscribePicks } from './browser-page-comments';
import { CommentToggle } from './comment-capture';
import { ADD_COMMENT_SESSION_EVENT } from './comment-model';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://agent.test' } }),
}));

afterEach(cleanup);

describe('a region drawn over the live view', () => {
  const viewport = { width: 1280, height: 800 };

  it('is a rectangle of the page view when the frame fills the view', () => {
    const box = { left: 0, top: 0, width: 640, height: 400 };
    expect(frameRect([0.25, 0.25, 0.5, 0.5], box, viewport)).toEqual([0.25, 0.25, 0.5, 0.5]);
  });

  it('leaves out the letterbox around the frame (a phone)', () => {
    // The frame is 390 x 243.75, centred in a 390 x 600 box: 178.125 px above and below.
    const box = { left: 0, top: 0, width: 390, height: 600 };
    const rect = frameRect([0, 0, 1, 1], box, viewport);
    expect(rect).toEqual([0, 0, 1, 1]);
    expect(frameRect([0, 0, 1, 0.2], box, viewport)).toBeNull(); // only the letterbox
  });
});

function Harness({
  send,
  subscribe,
}: {
  send: (input: BrowserInput) => void;
  subscribe: SubscribePicks;
}) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <BrowserPageComments
        page={{ id: 'p1', url: 'http://site.test/form', title: 'Submit a dataset' }}
        subscribe={subscribe}
        send={send}
      >
        <CommentToggle />
      </BrowserPageComments>
    </QueryClientProvider>
  );
}

describe('comments on a browser page', () => {
  it('asks the page for a pick while the session is open and attaches what it picked', async () => {
    const user = userEvent.setup();
    const sent: BrowserInput[] = [];
    const listeners = new Set<(anchor: unknown) => void>();
    const subscribe: SubscribePicks = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const pick = (anchor: unknown) => listeners.forEach((listener) => listener(anchor));
    const attached: CommentAttachment[] = [];
    const listen = (event: Event) =>
      attached.push((event as CustomEvent<CommentAttachment>).detail);
    window.addEventListener(ADD_COMMENT_SESSION_EVENT, listen);
    render(<Harness subscribe={subscribe} send={(input) => sent.push(input)} />);

    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(sent).toEqual([{ type: 'pick.start', mode: 'text' }]);

    const page = { page: { id: 'p1', url: 'http://site.test/form', title: 'Submit a dataset' } };
    act(() => {
      pick({
        profile: 'text-quote',
        exact: 'Submit',
        source: { page: { id: 'other' } },
      });
      pick({ profile: 'text-quote', exact: 'Submit a dataset', source: page });
    });
    expect(screen.getByRole('textbox', { name: 'Comment for S1' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Comment for S2' })).toBeNull(); // another page's pick

    await user.type(screen.getByRole('textbox', { name: 'Comment for S1' }), 'Make this larger.');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: /Add 1 mark to message/u }));
    expect(sent.at(-1)).toEqual({ type: 'pick.stop' });
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({
      kind: 'browser-page',
      title: 'Submit a dataset',
      marks: [
        {
          label: 'S1',
          comment: 'Make this larger.',
          anchor: { exact: 'Submit a dataset', source: page },
        },
      ],
    });
    window.removeEventListener(ADD_COMMENT_SESSION_EVENT, listen);
  });
});
