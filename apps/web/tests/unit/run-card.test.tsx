/**
 * The run card (gact-tui#370) — the transcript's boxed object for a curated
 * relay/cluster run tool call (`jarvis_run` -> "Run Pipeline"). Chrome
 * mirrors ToolPart's collapsed/expand grammar; live refresh mirrors
 * McpTaskPeekView's fetch + SSE-subscribe + poll-backstop idiom
 * (mcp-task-peek.test.tsx is the sibling coverage for that half).
 *
 * States covered: queued (static snapshot, no live wiring), running with a
 * growing console tail (live poll), completed-clean, completed-but-error-
 * result rendering FAILED (the owner's honesty caveat #1 — a "completed"
 * MCP-protocol result can still wrap an application failure), and a failed
 * call's typed reason staying hover/expand-only rather than inline noise.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Client, SessionAsyncProcess } from '@clio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRelayRunCall, RunCardPart } from '../../src/transcript/parts/RunCardPart';
import type { WirePart } from '../../src/transcript/registry';

function toolCall(toolName: string, input: unknown = {}, id = 'call_1'): WirePart {
  return { type: 'tool_call', id, call_id: id, tool_name: toolName, input };
}

function toolResult(callId: string, fields: Record<string, unknown>): WirePart {
  return { type: 'tool_result', call_id: callId, ...fields };
}

const QUEUED_HANDLE = {
  task_id: 'jarvis-1',
  job_id: 'jarvis-1',
  kind: 'jarvis',
  state: 'queued',
  terminal: false,
};

const BASE_RECORD: SessionAsyncProcess = {
  kind: 'mcp-task',
  id: 'jarvis-1',
  title: 'jarvis_run',
  status: 'working',
  created_at: '2026-08-19T11:00:00Z',
  updated_at: '2026-08-19T11:00:00Z',
  key: { server_id: 'relay-ares', session_id: 'sess_a', task_id: 'jarvis-1' },
  backend: { cluster: 'ares' },
};

function fakeClient(processes: SessionAsyncProcess[]): Client {
  return {
    baseUrl: 'http://live.test',
    sseUrl: (id: string) => `http://live.test/v1/sessions/${id}/events`,
    get: vi.fn(async (path: string) => {
      if (path.includes('/async-processes')) return { processes };
      throw new Error(`unstubbed GET ${path}`);
    }),
  } as unknown as Client;
}

describe('isRelayRunCall', () => {
  it('gates on the curated relay-run tool name, never inferred', () => {
    expect(isRelayRunCall(toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p1' }))).toBe(true);
    expect(isRelayRunCall(toolCall('jarvis_describe', {}))).toBe(false);
    expect(isRelayRunCall(toolCall('read_file', {}))).toBe(false);
  });
});

describe('run card — queued (static snapshot, no live wiring)', () => {
  it('renders queued from the handle result alone, with cluster/pipeline in the header', () => {
    render(
      <RunCardPart
        call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p5run2' })}
        result={toolResult('call_1', { structured_content: QUEUED_HANDLE })}
      />,
    );
    const card = screen.getByTestId('run-card');
    expect(card).toHaveAttribute('data-phase', 'queued');
    expect(screen.getByTestId('run-card-phase')).toHaveTextContent('queued');
    expect(screen.getByText('Run Pipeline')).toBeInTheDocument();
    expect(screen.getByText('(p5run2)')).toBeInTheDocument();
    expect(screen.getByTestId('run-card-cluster')).toHaveTextContent('ares');
  });

  it('never renders internal vocabulary — the raw tool name, isError, or mcp_task', () => {
    render(
      <RunCardPart
        call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p5run2' })}
        result={toolResult('call_1', { structured_content: QUEUED_HANDLE })}
      />,
    );
    expect(screen.queryByText('jarvis_run', { exact: false })).toBeNull();
    expect(screen.queryByText(/isError/i)).toBeNull();
    expect(screen.queryByText(/mcp_task/i)).toBeNull();
  });

  it('renders queued even with no result yet (still in flight)', () => {
    render(<RunCardPart call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p1' })} />);
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-phase', 'queued');
  });
});

describe('run card — running, with live console growth (poll-driven)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens to show the console tail, then grows it on the next poll', async () => {
    const running: SessionAsyncProcess = {
      ...BASE_RECORD,
      status: 'working',
      backend: { cluster: 'ares', console: { tail: 'starting lammps...\n', offset: 20, truncated: false } },
    };
    const client = fakeClient([running]);
    render(
      <RunCardPart
        call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p5run2' })}
        result={toolResult('call_1', { structured_content: QUEUED_HANDLE })}
        client={client}
        sessionId="sess_a"
      />,
    );

    // Initial reconcile fires on mount (no fake-timer advance needed).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-phase', 'running');

    fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
    expect(screen.getByTestId('run-card-console')).toHaveTextContent('starting lammps...');

    // Next poll round folds in more console text (relay_console.py's
    // on_poll fold) — the SAME client, a fresh GET response.
    (client.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
      if (path.includes('/async-processes')) {
        return {
          processes: [
            {
              ...running,
              backend: {
                cluster: 'ares',
                console: { tail: 'starting lammps...\nstep 1 of 500\n', offset: 40, truncated: false },
              },
            },
          ],
        };
      }
      throw new Error(`unstubbed GET ${path}`);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByTestId('run-card-console')).toHaveTextContent('step 1 of 500');
  });

  it('surfaces a truncated console tail as a typed note, never a silent shrink', async () => {
    const truncated: SessionAsyncProcess = {
      ...BASE_RECORD,
      backend: { cluster: 'ares', console: { tail: 'tail bytes only', offset: 999999, truncated: true } },
    };
    render(
      <RunCardPart
        call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p5run2' })}
        result={toolResult('call_1', { structured_content: QUEUED_HANDLE })}
        client={fakeClient([truncated])}
        sessionId="sess_a"
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
    expect(screen.getByTestId('run-card-console-truncated')).toBeInTheDocument();
  });
});

describe('run card — completed, clean', () => {
  it('renders completed with no reason and a duration', async () => {
    const completed: SessionAsyncProcess = {
      ...BASE_RECORD,
      status: 'completed',
      created_at: '2026-08-19T11:00:00Z',
      updated_at: '2026-08-19T11:02:30Z',
    };
    render(
      <RunCardPart
        call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p5run2' })}
        result={toolResult('call_1', { structured_content: QUEUED_HANDLE })}
        client={fakeClient([completed])}
        sessionId="sess_a"
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-phase', 'completed');
    expect(screen.getByTestId('run-card-duration')).toHaveTextContent('2m 30s');
    fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
    expect(screen.queryByTestId('run-card-reason')).toBeNull();
  });
});

describe('run card — completed-but-error-result renders FAILED (honesty caveat #1)', () => {
  it('an execution payload carrying error/return_code wins over an MCP "completed" status', async () => {
    const errored = toolResult('call_1', {
      is_error: false,
      structured_content: {
        schema_version: 'clio-agent.jarvis-execution.v1',
        pipeline_id: 'p5run2',
        execution_id: 'exec-1',
        state: 'completed',
        terminal: true,
        error: 'application exited with a non-zero return code',
        return_code: 139,
        progress: null,
        artifacts: null,
        services: null,
        scheduler_native_id: null,
        scheduler_provider: null,
      },
    });
    const completedRecord: SessionAsyncProcess = { ...BASE_RECORD, status: 'completed' };
    render(
      <RunCardPart
        call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p5run2' })}
        result={errored}
        client={fakeClient([completedRecord])}
        sessionId="sess_a"
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // FAILED wins even though the live record's own MCP status says "completed".
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-phase', 'failed');
    expect(screen.getByTestId('run-card-phase')).toHaveAttribute(
      'title',
      'application exited with a non-zero return code',
    );
  });

  it('a bare non-zero return_code with no error string still fails, honestly worded', () => {
    const errored = toolResult('call_1', {
      structured_content: { state: 'completed', terminal: true, error: null, return_code: 1 },
    });
    render(<RunCardPart call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p1' })} result={errored} />);
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-phase', 'failed');
    fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
    expect(screen.getByTestId('run-card-reason')).toHaveTextContent('exited with code 1');
  });
});

describe('run card — failed, typed reason stays hover/expand-only', () => {
  it('is_error carries the failure; the reason never renders inline while collapsed', () => {
    const failed = toolResult('call_1', {
      is_error: true,
      content: [{ type: 'text', text: 'jarvis_remote_call_failed: relay dispatch rejected' }],
    });
    render(<RunCardPart call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p1' })} result={failed} />);

    const card = screen.getByTestId('run-card');
    expect(card).toHaveAttribute('data-phase', 'failed');
    // Collapsed: the reason is not inline text on the page.
    expect(screen.queryByTestId('run-card-reason')).toBeNull();
    // ...but it IS available on hover, via the chip's title attribute.
    expect(screen.getByTestId('run-card-phase')).toHaveAttribute(
      'title',
      expect.stringContaining('jarvis_remote_call_failed'),
    );

    // Expand: now the reason is visible in the well.
    fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
    expect(screen.getByTestId('run-card-reason')).toHaveTextContent('jarvis_remote_call_failed');
  });
});

describe('run card — collapse/expand interaction', () => {
  it('starts collapsed; the well only mounts once opened', () => {
    render(
      <RunCardPart
        call={toolCall('jarvis_run', { cluster: 'ares', pipeline_id: 'p1' })}
        result={toolResult('call_1', { structured_content: QUEUED_HANDLE })}
      />,
    );
    expect(screen.queryByTestId('run-card-well')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
    expect(screen.getByTestId('run-card-well')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /run pipeline/i }));
    expect(screen.queryByTestId('run-card-well')).toBeNull();
  });
});
