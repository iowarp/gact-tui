/**
 * Round-6 live finding (screenshots/round6/2026-08-06_03-25-28-CONCURRENCY-
 * transcript.png): under backend contention (3 concurrent children
 * streaming), FAILED reads rendered as confident empty/zero facts instead of
 * an honest unresolved state — the no-silent-fallback rule applied to the
 * client.
 *
 *  1. The obs layer read "no trace recorded for this session" (runs 0/
 *     tools 0/gantt 0) while the backend actually held 167 trace events —
 *     `optionalFetch()` collapsed "fetch failed" and "fetch succeeded,
 *     empty" into the same `null`.
 *  2. The topbar read "artifacts 0" while 5 existed — `artifactCount ?? 0`
 *     did the same collapse on render.
 *  3. The composer read "model not set" while claude_code/cc-sonnet was
 *     actually bound — a failed session-record OR global-LM read fell
 *     through to the same empty string as a genuinely unset model.
 *
 * These cases pin the fix: an UNRESOLVED read renders a distinct honest
 * state, never the same fact a genuinely empty/successful read earns. Every
 * "regression pin" case below re-proves the ORIGINAL honest-empty behavior
 * still holds once the reads genuinely succeed.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';
import { Topbar } from '../../src/shell/Topbar';
import { Observability } from '../../src/observability/Observability';
import type { ObservabilityData } from '../../src/observability/types';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];
const MESSAGES: Message[] = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ready' }] },
] as unknown as Message[];

async function selectSession(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await screen.findByText('ready');
}

async function openObservability(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Observability' }));
  return screen.findByRole('dialog', { name: /observability/i });
}

// ---- 1. obs layer: failed trace read vs genuinely empty ----

describe('obs layer — failed trace read renders unavailable, never a confident zero', () => {
  it('shows "runs unavailable — retrying" (not "no trace recorded") when the trace read fails', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/trace')) throw new Error('timeout under concurrency');
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();
    const runsTab = await within(obsLayer).findByRole('tab', { name: /^runs/i });
    fireEvent.click(runsTab);

    const unavailable = await within(obsLayer).findByTestId('obs-unavailable');
    expect(unavailable).toHaveTextContent(/runs unavailable/i);
    expect(within(obsLayer).queryByTestId('obs-empty')).toBeNull();
    expect(within(obsLayer).queryByText(/no trace recorded/i)).toBeNull();
  });

  it('the "retry now" button re-runs the read, and a subsequent success shows the honest empty state', async () => {
    let traceCalls = 0;
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/trace')) {
          traceCalls += 1;
          if (traceCalls === 1) throw new Error('timeout under concurrency');
          return { events: [] };
        }
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();
    fireEvent.click(await within(obsLayer).findByRole('tab', { name: /^runs/i }));
    await within(obsLayer).findByTestId('obs-unavailable');

    fireEvent.click(within(obsLayer).getByRole('button', { name: /retry now/i }));

    await waitFor(() =>
      expect(within(obsLayer).getByTestId('obs-empty')).toHaveTextContent(/no trace recorded/i),
    );
    expect(traceCalls).toBeGreaterThanOrEqual(2);
  });

  it('regression pin: still reads "no trace recorded" for a genuinely empty, successfully-read session', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/trace')) return { events: [] };
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    const obsLayer = await openObservability();
    fireEvent.click(await within(obsLayer).findByRole('tab', { name: /^runs/i }));

    await waitFor(() =>
      expect(within(obsLayer).getByTestId('obs-empty')).toHaveTextContent(/no trace recorded/i),
    );
    expect(within(obsLayer).queryByTestId('obs-unavailable')).toBeNull();
  });
});

describe('Observability component — traceReadFailed threads into every trace-derived empty state', () => {
  function data(overrides: Partial<ObservabilityData> = {}): ObservabilityData {
    return {
      agents: [],
      runs: [],
      toolsByExpert: {},
      artifacts: [],
      timeline: [],
      spans: [],
      artifactRows: [],
      toolCalls: [],
      ...overrides,
    };
  }

  it('renders "timeline unavailable — retrying" in log mode instead of "no trace recorded"', () => {
    render(<Observability data={data({ traceReadFailed: true })} initialTab="timeline" onRetryTrace={vi.fn()} />);
    expect(screen.getByTestId('obs-unavailable')).toHaveTextContent(/timeline unavailable/i);
    expect(screen.queryByTestId('obs-empty')).toBeNull();
  });

  it('renders "gantt unavailable — retrying" in gantt mode instead of "no trace recorded"', () => {
    render(<Observability data={data({ traceReadFailed: true })} initialTab="timeline" onRetryTrace={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^gantt$/i }));
    expect(screen.getByTestId('obs-unavailable')).toHaveTextContent(/gantt unavailable/i);
  });

  it('renders "tool calls unavailable — retrying" instead of "no tool calls recorded"', () => {
    render(<Observability data={data({ traceReadFailed: true })} initialTab="tools" onRetryTrace={vi.fn()} />);
    expect(screen.getByTestId('obs-unavailable')).toHaveTextContent(/tool calls unavailable/i);
    expect(screen.queryByText(/no tool calls recorded/i)).toBeNull();
  });

  it('wires the retry button to onRetryTrace', () => {
    const onRetryTrace = vi.fn();
    render(<Observability data={data({ traceReadFailed: true })} initialTab="runs" onRetryTrace={onRetryTrace} />);
    fireEvent.click(screen.getByRole('button', { name: /retry now/i }));
    expect(onRetryTrace).toHaveBeenCalledTimes(1);
  });

  it('regression pin: traceReadFailed absent still reads the plain honest-empty copy', () => {
    render(<Observability data={data()} initialTab="runs" />);
    expect(screen.getByTestId('obs-empty')).toHaveTextContent(/no trace recorded/i);
    expect(screen.queryByTestId('obs-unavailable')).toBeNull();
  });
});

// ---- 2. topbar artifacts badge: undefined must never render as 0 ----

describe('Topbar artifacts badge — undefined (unresolved/failed) is never the same glyph as a real zero', () => {
  it('renders a dash when artifactCount is undefined', () => {
    render(<Topbar title="a session" railCollapsed={false} onShowRail={vi.fn()} />);
    const badge = screen.getByRole('button', { name: 'artifacts' }).querySelector('.shell-topbar__count');
    expect(badge?.textContent).toBe('—');
  });

  it('regression pin: renders the real zero when artifactCount is a successfully-read 0', () => {
    render(<Topbar title="a session" railCollapsed={false} onShowRail={vi.fn()} artifactCount={0} />);
    const badge = screen.getByRole('button', { name: 'artifacts' }).querySelector('.shell-topbar__count');
    expect(badge?.textContent).toBe('0');
  });

  it('still renders a real count when one is supplied', () => {
    render(<Topbar title="a session" railCollapsed={false} onShowRail={vi.fn()} artifactCount={5} />);
    const badge = screen.getByRole('button', { name: 'artifacts' }).querySelector('.shell-topbar__count');
    expect(badge?.textContent).toBe('5');
  });
});

describe('round-6 CONCURRENCY: topbar artifacts badge through the real refreshPill fetch', () => {
  it('reads — (not a false "0") when the artifacts fetch fails', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/artifacts')) throw new Error('timeout under concurrency');
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        return { tasks: [] };
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();

    await waitFor(() => {
      const badge = screen.getByRole('button', { name: 'artifacts' }).querySelector('.shell-topbar__count');
      expect(badge?.textContent).toBe('—');
    });
  });

  it('regression pin: reads a real "0" once the artifacts fetch succeeds empty', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/artifacts')) return { artifacts: [] };
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        return { tasks: [] };
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();

    await waitFor(() => {
      const badge = screen.getByRole('button', { name: 'artifacts' }).querySelector('.shell-topbar__count');
      expect(badge?.textContent).toBe('0');
    });
  });

  it('reads the real count (5) once the artifacts fetch succeeds with rows', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/artifacts')) {
          return {
            artifacts: Array.from({ length: 5 }, (_, i) => ({
              name: `station-${i}.csv`,
              head_artifact_id: `art_${i}`,
              versions: [{ artifact_id: `art_${i}`, name: `station-${i}.csv`, version: 1 }],
            })),
          };
        }
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        return { tasks: [] };
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();

    await waitFor(() => {
      const badge = screen.getByRole('button', { name: 'artifacts' }).querySelector('.shell-topbar__count');
      expect(badge?.textContent).toBe('5');
    });
  });
});

// ---- 3. composer model pill: unresolved vs genuinely-unset vs last-known ----

describe('round-6 CONCURRENCY: composer model pill unresolved vs genuinely-unset vs last-known', () => {
  it('renders — (never "model not set") while both the session record and global LM reads are failed', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      getSession: vi.fn(async () => {
        throw new Error('session store unreadable under concurrency');
      }),
      get: vi.fn(async (path: string) => {
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        throw new Error(`unstubbed GET ${path}`); // covers /v1/providers/lm
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();

    await waitFor(() => expect(screen.getByTestId('composer-model')).toHaveTextContent('—'));
    expect(screen.getByTestId('composer-model')).not.toHaveTextContent('model not set');
  });

  it('prefers the last-known GLOBAL binding over a dash when only the session-record read fails', async () => {
    // Exactly the round-6 shape: the session record read fails, but the
    // global LM binding (claude_code/cc-sonnet) is real and readable.
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      getSession: vi.fn(async () => {
        throw new Error('session store unreadable under concurrency');
      }),
      get: vi.fn(async (path: string) => {
        if (path === '/v1/providers/lm') {
          return { configured: true, provider: 'claude_code', api_base: '', model: 'cc-sonnet' };
        }
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        return { tasks: [] };
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();

    await waitFor(() =>
      expect(screen.getByTestId('composer-model')).toHaveTextContent('claude_code/cc-sonnet'),
    );
    expect(screen.getByTestId('composer-model')).not.toHaveTextContent('model not set');
    expect(screen.getByTestId('composer-model')).not.toHaveTextContent('—');
  });

  it('regression pin: still reads "model not set" once BOTH reads genuinely succeed and report nothing', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      getSession: vi.fn(async () => ({
        id: 'sess_a',
        workspace_id: 'ws_default',
        approval_mode: 'ask',
      })),
      get: vi.fn(async (path: string) => {
        if (path === '/v1/providers/lm') {
          return { configured: false, provider: '', api_base: '', model: '' };
        }
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        return { tasks: [] };
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();

    await waitFor(() =>
      expect(screen.getByTestId('composer-model')).toHaveTextContent('model not set'),
    );
  });

  it('regression pin: the true idle/no-session screen still reads "model not set" immediately, with no session to wait on', async () => {
    // Pre-session there is no per-session record at all — the model pill
    // must NOT wait on any read here (see fresh-session-conformance.test.tsx).
    const client: Client = {
      baseUrl: 'http://live.test',
      workspaces: vi.fn(async () => ({ workspaces: [] })),
    } as unknown as Client;
    render(<SessionView client={client} sessions={[]} />);
    expect(screen.getByTestId('composer-model')).toHaveTextContent('model not set');
    // Flush the unmocked providers()/lmConfig() rejections the component
    // kicks off on mount so they do not resolve, unawaited, after the test
    // has already finished (same convention as fresh-session-conformance).
    await screen.findByTestId('suggested-prompts');
  });
});
