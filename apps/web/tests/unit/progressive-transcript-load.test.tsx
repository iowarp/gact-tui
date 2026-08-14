/**
 * Progressive transcript load (#232 paging; owner 2026-08-06: "today load()
 * blocks on one client.messages() fetch and shows 'loading…' until
 * everything parses ... small detail, big presentation help"). The backend
 * supports `limit`/`before` paging (GET /v1/sessions/{sid}/messages,
 * newest-first, next_cursor = oldest id in a truncated page) — SessionView's
 * `load()` fetches the newest page first (paints immediately) then
 * backfills older pages in the background, scroll-anchored so the backfill
 * never moves what's on screen.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'idle', workspace_id: 'ws_default' },
] as unknown as Session[];

const m = (id: string, text: string): Message =>
  ({ id, role: 'user', parts: [{ type: 'text', text }], created_at: `2026-01-01T00:00:0${id.slice(-1)}Z` }) as unknown as Message;

describe('progressive transcript load', () => {
  it('paints the NEWEST page immediately with a limited fetch, not the whole ledger', async () => {
    const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
      expect(opts?.before).toBeUndefined(); // first call never carries a cursor
      return { messages: [m('m3', 'third')], next_cursor: null };
    });
    const client = { baseUrl: 'http://live.test', messages } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));

    await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
    expect(messages).toHaveBeenCalledWith('sess_a', { limit: 50 });
    expect(messages).toHaveBeenCalledTimes(1); // next_cursor null -> nothing to backfill
  });

  it('backfills older pages via `before` cursors and prepends them in chronological order', async () => {
    const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
      if (!opts?.before) {
        return { messages: [m('m3', 'third')], next_cursor: 'm3' };
      }
      if (opts.before === 'm3') {
        return { messages: [m('m1', 'first'), m('m2', 'second')], next_cursor: null };
      }
      throw new Error(`unexpected before cursor: ${opts.before}`);
    });
    const client = { baseUrl: 'http://live.test', messages } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));

    // The tail paints first...
    await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
    // ...the backfill then fills in the older messages ABOVE it, in order.
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
    expect(screen.getByText('second')).toBeInTheDocument();
    const order = Array.from(document.querySelectorAll('.transcript__message')).map((el) =>
      el.getAttribute('data-message-id'),
    );
    expect(order).toEqual(['m1', 'm2', 'm3']);
    expect(messages).toHaveBeenCalledWith('sess_a', { limit: 50 });
    expect(messages).toHaveBeenCalledWith('sess_a', { limit: 50, before: 'm3' });
  });

  it('walks MULTIPLE backfill pages until next_cursor is null', async () => {
    const calls: Array<string | undefined> = [];
    const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
      calls.push(opts?.before);
      if (!opts?.before) return { messages: [m('m5', 'five')], next_cursor: 'm5' };
      if (opts.before === 'm5') return { messages: [m('m3', 'three'), m('m4', 'four')], next_cursor: 'm3' };
      if (opts.before === 'm3') return { messages: [m('m1', 'one'), m('m2', 'two')], next_cursor: null };
      throw new Error(`unexpected before cursor: ${opts.before}`);
    });
    const client = { baseUrl: 'http://live.test', messages } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));

    await waitFor(() => expect(screen.getByText('one')).toBeInTheDocument());
    const order = Array.from(document.querySelectorAll('.transcript__message')).map((el) =>
      el.getAttribute('data-message-id'),
    );
    expect(order).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(calls).toEqual([undefined, 'm5', 'm3']);
  });

  it('a failed backfill page leaves the already-loaded prefix intact (never fabricates the gap)', async () => {
    const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
      if (!opts?.before) return { messages: [m('m3', 'third')], next_cursor: 'm3' };
      throw new Error('HTTP 500: backend unreachable');
    });
    const client = { baseUrl: 'http://live.test', messages } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));

    await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
    // The failed backfill must not surface as a fake empty transcript, a
    // crash, or a fabricated placeholder — the loaded tail simply stays put.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText('third')).toBeInTheDocument();
    expect(screen.queryByTestId('transcript-error')).toBeNull();
  });

  it('anchors scroll on backfill: scrollTop shifts by exactly the height the prepended page added', async () => {
    // The older-page fetch is held open (a manually-resolved promise)
    // so the test can arm the scrollHeight override and an initial
    // scrollTop BEFORE the backfill lands — otherwise the mock's
    // near-instant resolution races ahead of the test's own setup.
    let resolveOlderPage!: (value: { messages: Message[]; next_cursor: string | null }) => void;
    const olderPage = new Promise<{ messages: Message[]; next_cursor: string | null }>((resolve) => {
      resolveOlderPage = resolve;
    });
    const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
      if (!opts?.before) return { messages: [m('m3', 'third')], next_cursor: 'm3' };
      return olderPage;
    });
    const client = { baseUrl: 'http://live.test', messages } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());

    const scroller = document.querySelector('.transcript') as HTMLDivElement;
    expect(scroller).not.toBeNull();
    // jsdom does no real layout — scrollHeight is a fixed 0 by default.
    // Tie it to the actual (real) DOM message count so the backfill's
    // height-delta compensation has something genuine to react to.
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get(this: HTMLDivElement) {
        return this.querySelectorAll('.transcript__message').length * 100;
      },
    });
    // The user is scrolled somewhere mid-transcript before the backfill lands.
    scroller.scrollTop = 50;
    expect(scroller.scrollHeight).toBe(100); // 1 message so far

    resolveOlderPage({ messages: [m('m1', 'first'), m('m2', 'second')], next_cursor: null });
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    // 2 older messages were prepended: scrollHeight grew 100 -> 300 (delta
    // 200) and scrollTop must have grown by exactly that delta, keeping
    // "third" pinned in the same visual spot rather than jumping.
    expect(scroller.scrollHeight).toBe(300);
    expect(scroller.scrollTop).toBe(250);
  });

  // ---- gact-tui#369: skeleton presentation + first-paint scheduling ----

  it('shows message-shaped skeleton rows only until the FIRST page lands, independent of backfill', async () => {
    let resolveFirstPage!: (value: { messages: Message[]; next_cursor: string | null }) => void;
    const messages = vi.fn(
      async (_id: string, opts?: { limit?: number; before?: string }) =>
        new Promise<{ messages: Message[]; next_cursor: string | null }>((resolve) => {
          if (opts?.before) throw new Error('backfill should not be reached in this test');
          resolveFirstPage = resolve;
        }),
    );
    const client = { baseUrl: 'http://live.test', messages } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));

    expect(await screen.findByTestId('transcript-skeleton')).toBeInTheDocument();
    resolveFirstPage({ messages: [m('m3', 'third')], next_cursor: null });
    await waitFor(() => expect(screen.queryByTestId('transcript-skeleton')).toBeNull());
    expect(screen.getByText('third')).toBeInTheDocument();
  });

  it('paints the first page WHILE the older-page backfill fetch is still unresolved (first-page paint precedes backfill completion)', async () => {
    // The gap gact-tui#369 asks to be PROVEN, not merely implied by call
    // ordering: hold the older (backfill) page open on a promise the test
    // controls, and assert the newest page is already visible — with the
    // skeleton gone — before that promise is ever resolved.
    let resolveOlderPage!: (value: { messages: Message[]; next_cursor: string | null }) => void;
    const olderPage = new Promise<{ messages: Message[]; next_cursor: string | null }>((resolve) => {
      resolveOlderPage = resolve;
    });
    let olderPageRequested = false;
    const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
      if (!opts?.before) return { messages: [m('m3', 'third')], next_cursor: 'm3' };
      olderPageRequested = true;
      return olderPage;
    });
    const client = { baseUrl: 'http://live.test', messages } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));

    await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
    expect(screen.queryByTestId('transcript-skeleton')).toBeNull();
    // The backfill fetch is genuinely in flight, not merely "not yet
    // started" — proving the first paint did not wait for it.
    expect(olderPageRequested).toBe(true);
    expect(screen.queryByText('first')).toBeNull();

    resolveOlderPage({ messages: [m('m1', 'first')], next_cursor: null });
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
  });
});
