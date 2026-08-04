/**
 * Slice D failing-first contract — composer pill wiring + control row
 * (P5 inventory D1–D5, docs/design/p4-conformance-gaps.md).
 *
 * Geometry (orange 30×30 send circle, chip padding, separators) is verified
 * by the browser conformance audit; THIS file pins structure and semantics:
 * the pill carries live values, the acceptance menu is ONE control, the
 * model selector reads `Provider / model`, and the context read names its
 * scope — the exact omission behind the live-gate 422.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../../src/composer/Composer';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];

const MESSAGES: Message[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'plot the station' }] },
] as unknown as Message[];

/**
 * Transport-level stub: the wiring contract pins the PATHS the view reads,
 * because the 422 regression lived in a path (missing ?scope=).
 */
function makeClient(gets: Record<string, unknown> = {}) {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    get: vi.fn(async (path: string) => {
      for (const [needle, body] of Object.entries(gets)) {
        if (path.includes(needle)) return body;
      }
      throw new Error(`unstubbed GET ${path}`);
    }),
  } as unknown as Client;
}

const CONNECTIONS = [{ id: 'c1', label: 'local', url: 'http://live.test', status: 'ready' as const }];

async function openSession(client: Client) {
  render(
    <SessionView
      client={client}
      sessions={SESSIONS}
      connections={CONNECTIONS}
      activeConnectionId="c1"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await waitFor(() => expect(screen.getByText('plot the station')).toBeInTheDocument());
}

describe('pill wiring (D1)', () => {
  it('counts ALL non-terminal async work from the session agent-tasks', async () => {
    const client = makeClient({
      '/agent-tasks': {
        tasks: [
          { id: 't1', status: 'running' },
          { id: 't2', status: 'queued' },
          { id: 't3', status: 'completed' },
        ],
      },
      '/context/state': { used_pct: 41 },
    });
    await openSession(client);
    await waitFor(() => expect(screen.getByText(/async 2/)).toBeInTheDocument());
  });

  it('reads the context percentage for the ACTIVE scope — never a bare state call', async () => {
    const client = makeClient({
      '/agent-tasks': { tasks: [] },
      '/context/state': { used_pct: 41 },
    });
    await openSession(client);
    await waitFor(() => expect(screen.getByText(/ctx 41%/)).toBeInTheDocument());
    const getMock = (client as unknown as { get: ReturnType<typeof vi.fn> }).get;
    const statePath = getMock.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .find((p: string) => p.includes('/context/state'));
    // The endpoint 422s without scope (routes/context.py:181); the live gate
    // caught exactly this omission.
    expect(statePath).toMatch(/\/context\/state\?scope=/);
  });

  it('labels placement as connection:workspace', async () => {
    const client = makeClient({ '/agent-tasks': { tasks: [] }, '/context/state': { used_pct: 0 } });
    await openSession(client);
    await waitFor(() => expect(screen.getByText(/local:/)).toBeInTheDocument());
  });

  it('the pill persists when async work is zero and the model-grounded read is empty', async () => {
    // Live finding (2026-08-03): a fresh session has used_pct null and no
    // tasks, and the whole pill vanished. Placement is ALWAYS known while a
    // session is open; ctx falls back to the segment-attributed pct_used.
    const client = makeClient({
      '/agent-tasks': { tasks: [] },
      '/context/state': { used_pct: null, pct_used: 7.4 },
    });
    await openSession(client);
    await waitFor(() => expect(screen.getByText(/local:/)).toBeInTheDocument());
    expect(screen.getByText(/ctx 7%/)).toBeInTheDocument();
  });

  it('placement still renders when the auxiliary reads fail', async () => {
    // No silent blanking: a failed tasks/context read costs those chips, not
    // the pill.
    const client = makeClient({});
    await openSession(client);
    await waitFor(() => expect(screen.getByText(/local:/)).toBeInTheDocument());
  });
});

describe('control row (D2–D4)', () => {
  function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
    return render(
      <Composer
        onSubmit={vi.fn()}
        models={[{ id: 'sonnet', label: 'claude-sonnet-5', detail: 'Anthropic' }]}
        modelId="sonnet"
        onModelChange={vi.fn()}
        approvalMode="ask"
        onApprovalModeChange={vi.fn()}
        {...overrides}
      />,
    );
  }

  it('send is the prototype arrow-up control', () => {
    renderComposer();
    const send = screen.getByRole('button', { name: /send/i });
    expect(send.querySelector('[data-icon="arrow-up"]')).not.toBeNull();
  });

  it('the acceptance menu is ONE control: the ask button, iconed, no duplicate dropdown', () => {
    renderComposer();
    // Exactly one control answers to "ask" — the segmented toggle AND a
    // separate dropdown carrying the same word is the current defect.
    const askButtons = screen.getAllByRole('button', { name: /ask/i });
    expect(askButtons).toHaveLength(1);
    const ask = askButtons[0]!;
    expect(ask).toHaveAttribute('data-testid', 'composer-approval');
    expect(ask.querySelector('[data-icon="ask"]')).not.toBeNull();
  });

  it('picking an acceptance mode from the ask menu reports the change', () => {
    const onApprovalModeChange = vi.fn();
    renderComposer({ onApprovalModeChange });
    fireEvent.click(screen.getByTestId('composer-approval'));
    const menu = screen.getByRole('menu');
    for (const mode of ['ask', 'auto-edits', 'bypass', 'ai-review']) {
      expect(within(menu).getByText(mode)).toBeInTheDocument();
    }
    fireEvent.click(within(menu).getByText('auto-edits'));
    expect(onApprovalModeChange).toHaveBeenCalledWith('auto-edits');
  });

  it('execute renders as a quiet iconed button, still the submit-mode toggle', () => {
    renderComposer();
    const execute = screen.getByRole('button', { name: /execute/i });
    expect(execute.querySelector('[data-icon="play"]')).not.toBeNull();
  });

  it('the model selector reads Provider / model behind the sparkle', () => {
    renderComposer();
    const model = screen.getByTestId('composer-model');
    expect(model.textContent).toContain('Anthropic / claude-sonnet-5');
    expect(model.querySelector('[data-icon="sparkle"]')).not.toBeNull();
  });

  it('still states when no model is set', () => {
    renderComposer({ models: [], modelId: '' });
    expect(screen.getByTestId('composer-model').textContent).toContain('model not set');
  });
});
