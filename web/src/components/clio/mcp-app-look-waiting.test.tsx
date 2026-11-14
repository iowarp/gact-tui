import type { TransportFrame } from '@clio/core/v3';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpAppInTabRow } from './mcp-app-card';
import { dispatchMcpAppLookFrame, McpAppLooks } from './mcp-app-look';
import { resetWaitingViewLooks, trackViewLook, useWaitingViewLook } from './mcp-app-look-waiting';
import { ViewLookWaiting } from './mcp-app-look-waiting-notice';
import { OPEN_MCP_APP_TAB_EVENT } from './mcp-app-live-set';

/** An IntersectionObserver the test drives: `show(false)` scrolls the frame away. */
class FakeObserver {
  static last: FakeObserver | undefined;
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }
  observe = vi.fn();
  disconnect = vi.fn();
  show(visible: boolean) {
    this.callback(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

const target = {
  label: 'GNSS stations',
  appInstanceId: 'app1',
  dataRef: 'ref',
  sessionId: 's1',
  resourceUri: 'ui://geo/globe',
  sourceServer: 'geo',
  toolName: 'show_on_globe',
};

function lookFrame(callId: string): TransportFrame {
  return {
    cursor: '1',
    eventName: 'mcp_app_look',
    receivedAt: '2026-11-14T00:00:00Z',
    data: {
      protocol_version: '0.3',
      type: 'mcp_app_look',
      occurred_at: '2026-11-14T00:00:00Z',
      scope: { connection_id: 'local', session_id: 's1' },
      payload: { session_id: 's1', app_instance_id: 'app1', call_id: callId, max_side: 900 },
    },
  };
}

/** A frame laid out in the window (jsdom lays nothing out), or one with no box at all. */
function frameOnScreen(shown = true): Element {
  return {
    getClientRects: () => (shown ? [{}] : []),
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 400, bottom: 300 }),
  } as unknown as Element;
}

function Probe({ sessionId, appInstanceId }: { sessionId?: string; appInstanceId?: string }) {
  const look = useWaitingViewLook({ sessionId, appInstanceId });
  return look ? <ViewLookWaiting look={look} /> : <span>nothing hidden</span>;
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  act(() => resetWaitingViewLooks());
  vi.unstubAllGlobals();
});

describe('a look that waits on a view the person cannot see (DOCS-F2)', () => {
  it('says so only while the frame is off screen, and the row shows the view', async () => {
    const reveal = vi.fn();
    render(<Probe sessionId="s1" />);
    let done = () => undefined as void;
    act(() => {
      done = trackViewLook(
        { callId: 'c1', sessionId: 's1', appInstanceId: 'app1', reveal },
        frameOnScreen(),
      ).end;
    });
    // On screen (or not known yet): the look will answer by itself; nothing to say.
    expect(screen.getByText('nothing hidden')).toBeTruthy();
    act(() => FakeObserver.last!.show(false));
    expect(screen.getByText('waiting to see the view')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show it' }));
    expect(reveal).toHaveBeenCalledTimes(1);
    act(() => FakeObserver.last!.show(true));
    expect(screen.getByText('nothing hidden')).toBeTruthy();
    act(() => FakeObserver.last!.show(false));
    act(() => done());
    expect(screen.getByText('nothing hidden')).toBeTruthy();
    expect(FakeObserver.last!.disconnect).toHaveBeenCalled();
  });

  it('keeps another conversation’s look out of this one', () => {
    render(<Probe sessionId="s2" />);
    act(() => {
      trackViewLook(
        { callId: 'c1', sessionId: 's1', appInstanceId: 'app1', reveal: vi.fn() },
        frameOnScreen(),
      );
      FakeObserver.last!.show(false);
    });
    expect(screen.getByText('nothing hidden')).toBeTruthy();
  });

  it('lists a mount’s snapshot while it is in progress, and no longer once it answered', async () => {
    let finish = (_value: unknown) => undefined as void;
    const snapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const postMcpAppLook = vi.fn().mockResolvedValue({});
    const looks = new McpAppLooks(
      { setMcpAppShown: vi.fn().mockResolvedValue({}), postMcpAppLook },
      { sessionId: 's1', appInstanceId: 'app1', dataRef: 'ref' },
      snapshot as never,
      (callId) =>
        trackViewLook(
          { callId, sessionId: 's1', appInstanceId: 'app1', reveal: vi.fn() },
          frameOnScreen(),
        ),
    );
    looks.start();
    render(<Probe appInstanceId="app1" />);
    act(() => dispatchMcpAppLookFrame(lookFrame('look_1')));
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalled());
    act(() => FakeObserver.last!.show(false));
    expect(screen.getByText('waiting to see the view')).toBeTruthy();
    await act(async () => finish({ image: 'data:image/png;base64,iVBORw0KGgo=' }));
    await vi.waitFor(() => expect(postMcpAppLook).toHaveBeenCalledTimes(1));
    expect(screen.getByText('nothing hidden')).toBeTruthy();
    looks.stop();
  });

  it('answers a look still hidden after 30 s in words: the view was not on screen', async () => {
    vi.useFakeTimers();
    try {
      for (const [hidden, reason] of [
        [true, 'view_not_visible'],
        [false, 'snapshot_unanswered'],
      ] as const) {
        const postMcpAppLook = vi.fn().mockResolvedValue({});
        const looks = new McpAppLooks(
          { setMcpAppShown: vi.fn().mockResolvedValue({}), postMcpAppLook },
          { sessionId: 's1', appInstanceId: 'app1', dataRef: 'ref' },
          (() => new Promise(() => undefined)) as never,
          (callId) =>
            trackViewLook(
              { callId, sessionId: 's1', appInstanceId: 'app1', reveal: vi.fn() },
              frameOnScreen(),
            ),
        );
        looks.start();
        dispatchMcpAppLookFrame(lookFrame(`look_${reason}`));
        await vi.advanceTimersByTimeAsync(10);
        if (hidden) FakeObserver.last!.show(false);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(postMcpAppLook).toHaveBeenCalledTimes(1);
        const answer = postMcpAppLook.mock.calls[0]![2] as {
          error: { reason: string; message: string };
        };
        expect(answer.error.reason).toBe(reason);
        if (hidden) expect(answer.error.message).toContain('Ask the person to show the view');
        looks.stop();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for a hidden frame to be shown, then takes the snapshot', async () => {
    const snapshot = vi.fn().mockResolvedValue({ image: 'data:image/png;base64,iVBORw0KGgo=' });
    const postMcpAppLook = vi.fn().mockResolvedValue({});
    const looks = new McpAppLooks(
      { setMcpAppShown: vi.fn().mockResolvedValue({}), postMcpAppLook },
      { sessionId: 's1', appInstanceId: 'app1', dataRef: 'ref' },
      snapshot,
      (callId) =>
        trackViewLook(
          { callId, sessionId: 's1', appInstanceId: 'app1', reveal: vi.fn() },
          frameOnScreen(false),
        ),
    );
    looks.start();
    render(<Probe appInstanceId="app1" />);
    act(() => dispatchMcpAppLookFrame(lookFrame('look_hidden')));
    // Hidden from the start: said at once, and no snapshot of a frame with no size.
    expect(screen.getByText('waiting to see the view')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(snapshot).not.toHaveBeenCalled();
    act(() => FakeObserver.last!.show(true));
    await vi.waitFor(() => expect(postMcpAppLook).toHaveBeenCalledTimes(1));
    expect(postMcpAppLook.mock.calls[0]![2]).toMatchObject({ image: expect.any(String) });
    looks.stop();
  });

  it('the in-tab row of a view whose tab is hidden says the agent waits, and shows the tab', async () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_MCP_APP_TAB_EVENT, opened);
    render(<McpAppInTabRow target={target} />);
    expect(screen.queryByRole('status')).toBeNull();
    const reveal = vi.fn();
    act(() => {
      trackViewLook(
        { callId: 'c1', sessionId: 's1', appInstanceId: 'app1', reveal },
        frameOnScreen(),
      );
      FakeObserver.last!.show(false);
    });
    expect(screen.getByRole('status').textContent).toContain(
      'The agent is waiting to see this view.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show it' }));
    expect(reveal).toHaveBeenCalledTimes(1);
    // The row's own "Show tab" still focuses the tab.
    await userEvent.setup().click(screen.getByRole('button', { name: /Show tab/u }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_MCP_APP_TAB_EVENT, opened);
  });
});
