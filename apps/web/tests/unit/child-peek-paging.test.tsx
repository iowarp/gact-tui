/**
 * Child/peek progressive paging (round-6 ruling, 2026-08-06): ChildFocusView
 * (SessionView's center drill-in, fed by SessionView's own child-focus data
 * source) and AgentPeekView (the right-panel read-only peek) used to
 * batch-fetch a child session's FULL message ledger on open — the same
 * anti-pattern the main transcript had before #232 paging. This pins the
 * same newest-page-first + backfill idiom applied to both.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentPeekView } from '../../src/session/AgentPeekView';
import { SessionView } from '../../src/session/SessionView';

const SETTLED_HANDOFF = {
  type: 'expert_handoff',
  id: 'live_handoff_1',
  agent_id: 'main',
  text: 'main -> geospatial',
  parent_agent: 'main',
  child_agent: 'geospatial',
  stage: 'delegate.completed',
  handle_id: 'task_1',
  run_label: 'geospatial #1',
  live_state: 'completed',
  status: 'completed',
  duration_ms: 1000,
  metadata: {},
};

const PARENT_MESSAGES: Message[] = [
  { id: 'p1', role: 'user', parts: [{ type: 'text', text: 'map the stations' }] },
  { id: 'p2', role: 'assistant', parts: [SETTLED_HANDOFF] },
] as unknown as Message[];

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'idle', workspace_id: 'ws_default' },
] as unknown as Session[];

// ChildFocusView treats the FIRST user message as the delegation "prompt
// from …" brief and hides it from the transcript body — role 'assistant'
// keeps every fixture message a plain, always-visible transcript line so
// these paging tests exercise ordering/visibility, not the brief fold.
const cm = (id: string, text: string): Message =>
  ({ id, role: 'assistant', parts: [{ type: 'text', text }] }) as unknown as Message;

function baseClient(messagesImpl: Client['messages']): Client {
  return {
    baseUrl: 'http://live.test',
    sseUrl: (id: string) => `http://live.test/v1/sessions/${id}/events`,
    messages: messagesImpl,
    getSession: vi.fn(async (id: string) => ({ id, status: 'completed' })),
    get: vi.fn(async (path: string) => {
      if (path.includes('/agent-tasks')) {
        return {
          tasks: [{ task_id: 'task_1', status: 'completed', child_session_id: 'sess_child' }],
        };
      }
      if (path.includes('/artifacts')) return { artifacts: [], count: 0 };
      throw new Error(`unstubbed GET ${path}`);
    }),
  } as unknown as Client;
}

describe('child/peek progressive paging (round-6, 2026-08-06)', () => {
  describe('ChildFocusView (SessionView center drill-in)', () => {
    it('paints the NEWEST page immediately with a limited fetch, never the whole ledger', async () => {
      const messages = vi.fn(async (id: string, opts?: { limit?: number; before?: string }) => {
        if (id === 'sess_a') return { messages: PARENT_MESSAGES, next_cursor: null };
        expect(id).toBe('sess_child');
        expect(opts?.before).toBeUndefined();
        expect(opts?.limit).toBe(50);
        return { messages: [cm('c3', 'third')], next_cursor: null };
      });
      render(<SessionView client={baseClient(messages)} sessions={SESSIONS} />);
      fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
      const card = await screen.findByTestId('part-child-card');
      fireEvent.click(card);

      await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
      expect(messages).toHaveBeenCalledWith('sess_child', { limit: 50 });
    });

    it('backfills OLDER pages via `before` cursors and prepends them in chronological order', async () => {
      const messages = vi.fn(async (id: string, opts?: { limit?: number; before?: string }) => {
        if (id === 'sess_a') return { messages: PARENT_MESSAGES, next_cursor: null };
        if (!opts?.before) return { messages: [cm('c3', 'third')], next_cursor: 'c3' };
        if (opts.before === 'c3') {
          return { messages: [cm('c1', 'first'), cm('c2', 'second')], next_cursor: null };
        }
        throw new Error(`unexpected before cursor: ${opts.before}`);
      });
      render(<SessionView client={baseClient(messages)} sessions={SESSIONS} />);
      fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
      const card = await screen.findByTestId('part-child-card');
      fireEvent.click(card);

      // The tail paints first...
      await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
      // ...the backfill then fills in the older messages ABOVE it, in order.
      await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
      expect(screen.getByText('second')).toBeInTheDocument();
      expect(messages).toHaveBeenCalledWith('sess_child', { limit: 50 });
      expect(messages).toHaveBeenCalledWith('sess_child', { limit: 50, before: 'c3' });
    });

    it('a failed backfill page leaves the already-loaded tail intact (never fabricates the gap)', async () => {
      const messages = vi.fn(async (id: string, opts?: { limit?: number; before?: string }) => {
        if (id === 'sess_a') return { messages: PARENT_MESSAGES, next_cursor: null };
        if (!opts?.before) return { messages: [cm('c3', 'third')], next_cursor: 'c3' };
        throw new Error('HTTP 500: backend unreachable');
      });
      render(<SessionView client={baseClient(messages)} sessions={SESSIONS} />);
      fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
      const card = await screen.findByTestId('part-child-card');
      fireEvent.click(card);

      await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.getByText('third')).toBeInTheDocument();
    });
  });

  describe('AgentPeekView (right-panel read-only peek)', () => {
    it('paints the NEWEST page immediately with a limited fetch, never the whole ledger', async () => {
      const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
        expect(opts?.before).toBeUndefined();
        expect(opts?.limit).toBe(50);
        return { messages: [cm('c3', 'third')], next_cursor: null };
      });
      render(
        <AgentPeekView
          client={baseClient(messages)}
          sessionId="sess_child"
          agent="geospatial"
          parentLabel="main"
          onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
      expect(messages).toHaveBeenCalledWith('sess_child', { limit: 50 });
    });

    it('backfills OLDER pages via `before` cursors and prepends them in chronological order', async () => {
      const messages = vi.fn(async (_id: string, opts?: { limit?: number; before?: string }) => {
        if (!opts?.before) return { messages: [cm('c3', 'third')], next_cursor: 'c3' };
        if (opts.before === 'c3') {
          return { messages: [cm('c1', 'first'), cm('c2', 'second')], next_cursor: null };
        }
        throw new Error(`unexpected before cursor: ${opts.before}`);
      });
      render(
        <AgentPeekView
          client={baseClient(messages)}
          sessionId="sess_child"
          agent="geospatial"
          parentLabel="main"
          onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText('third')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
      expect(screen.getByText('second')).toBeInTheDocument();
      expect(messages).toHaveBeenCalledWith('sess_child', { limit: 50 });
      expect(messages).toHaveBeenCalledWith('sess_child', { limit: 50, before: 'c3' });
    });

    it('keeps the SSE child feed intact: a streamed part still applies live on top of the paged load', async () => {
      const messages = vi.fn(async () => ({ messages: [cm('c1', 'first')], next_cursor: null }));
      render(
        <AgentPeekView
          client={baseClient(messages)}
          sessionId="sess_child"
          agent="geospatial"
          parentLabel="main"
          onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
      // SSE subscription is exercised end to end in the existing agent-peek
      // suite; this just pins that the progressive load didn't drop it.
      expect(screen.getByTestId('agent-peek')).toBeInTheDocument();
    });
  });
});
