/**
 * McpTaskPeekView (clio-agent#1205) — the async-processes tray's read-only
 * right-panel view for a durable MCP/relay task record. Chrome/behavior
 * mirrors agent-peek.test.tsx's own component-level coverage: renders
 * immediately from the initial snapshot prop, closes through its own
 * header control, surfaces a typed holding-path degrade rather than hiding
 * it, and reconciles via a poll backstop (SSE itself is unit-tested in
 * apps/core/tests/sse_async_process_events.test.ts — jsdom has no
 * EventSource, so that half is a no-op here, same precedent AgentPeekView's
 * own tests already rely on).
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Client, SessionAsyncProcess } from '@clio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpTaskPeekView } from '../../src/session/McpTaskPeekView';

const PROCESS: SessionAsyncProcess = {
  kind: 'mcp-task',
  id: 'jarvis-1',
  title: 'jarvis_run',
  status: 'working',
  created_at: '2026-08-12T11:00:00Z',
  updated_at: '2026-08-12T11:05:00Z',
  key: { server_id: 'relay-ares', session_id: 'sess_a', task_id: 'jarvis-1' },
  backend: { cluster: 'ares' },
};

function peekClient(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    sseUrl: (id: string) => `http://live.test/v1/sessions/${id}/events`,
    get: vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) return { processes: [PROCESS] };
      throw new Error(`unstubbed GET ${path}`);
    }),
    ...overrides,
  } as unknown as Client;
}

describe('McpTaskPeekView', () => {
  it('renders the two-row header and field list from the initial snapshot, with no follow-up fetch needed', () => {
    render(
      <McpTaskPeekView client={peekClient()} sessionId="sess_a" process={PROCESS} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('mcp-task-peek')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-task-peek-eyebrow')).toHaveTextContent('MCP TASK · working');
    expect(screen.getByTestId('mcp-task-peek-name')).toHaveTextContent('jarvis_run');
    expect(screen.getByText('session')).toBeInTheDocument();
    expect(screen.getByText('jarvis-1')).toBeInTheDocument();
    expect(screen.getByText('ares')).toBeInTheDocument();
  });

  it('is read-only: no composer input mounts inside the peek', () => {
    render(
      <McpTaskPeekView client={peekClient()} sessionId="sess_a" process={PROCESS} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('closes through its own header control', () => {
    const onClose = vi.fn();
    render(
      <McpTaskPeekView client={peekClient()} sessionId="sess_a" process={PROCESS} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close peek/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('surfaces a typed holding-path degrade instead of hiding it (no-silent-fallback)', () => {
    const held: SessionAsyncProcess = {
      ...PROCESS,
      holding_reason: 'mcp_task_session_deleted',
      cancel_requested: true,
    };
    render(
      <McpTaskPeekView client={peekClient()} sessionId="sess_a" process={held} onClose={vi.fn()} />,
    );
    const degrade = screen.getByTestId('mcp-task-peek-degrade');
    expect(degrade).toHaveTextContent('mcp_task_session_deleted');
    expect(degrade).toHaveTextContent('cancel requested');
  });

  it('resets to a freshly-clicked task\'s snapshot rather than keeping the previous one', () => {
    const { rerender } = render(
      <McpTaskPeekView client={peekClient()} sessionId="sess_a" process={PROCESS} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('mcp-task-peek-name')).toHaveTextContent('jarvis_run');

    const OTHER: SessionAsyncProcess = { ...PROCESS, id: 'jarvis-2', title: 'jarvis_describe' };
    rerender(
      <McpTaskPeekView client={peekClient()} sessionId="sess_a" process={OTHER} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('mcp-task-peek-name')).toHaveTextContent('jarvis_describe');
  });
});

describe('McpTaskPeekView — poll backstop reconcile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-fetches async-processes on the reconcile interval and applies the fresh status', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) {
        return { processes: [{ ...PROCESS, status: 'completed', updated_at: '2026-08-12T11:10:00Z' }] };
      }
      throw new Error(`unstubbed GET ${path}`);
    });
    render(
      <McpTaskPeekView client={peekClient({ get })} sessionId="sess_a" process={PROCESS} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('mcp-task-peek-eyebrow')).toHaveTextContent('MCP TASK · working');

    // advanceTimersByTimeAsync flushes the microtasks the fired interval's
    // async reconcile() creates, so the state update is applied by the time
    // this resolves — a real-timer `waitFor` after it would hang forever
    // (fake timers freeze waitFor's own internal polling clock).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByTestId('mcp-task-peek-eyebrow')).toHaveTextContent('MCP TASK · completed');
  });

  it('a reconcile fetch failure keeps the last-known state rather than clearing it', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) throw new Error('network down');
      throw new Error(`unstubbed GET ${path}`);
    });
    render(
      <McpTaskPeekView client={peekClient({ get })} sessionId="sess_a" process={PROCESS} onClose={vi.fn()} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByTestId('mcp-task-peek-eyebrow')).toHaveTextContent('MCP TASK · working');
  });
});
