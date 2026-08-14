/**
 * Opus adversarial review, fix #11: SessionView's own "Loading observability…"
 * bare paragraph (gact-tui#366's first pass covered SessionView's transcript
 * notice but missed this second one, the obs-panel content itself) now
 * renders the shared kit Skeleton primitive while `loadObservability`'s
 * multi-fetch chain is still in flight.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

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

describe('SessionView observability panel shows the Skeleton while loading', () => {
  it('renders the Skeleton, not a bare paragraph, while the multi-fetch obs read is in flight', async () => {
    const client: Client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      // Never resolves — loadObservability's Promise.all chain hangs here,
      // so `obs` stays null and the panel's loading branch stays mounted
      // for the life of this test.
      agents: vi.fn(() => new Promise(() => {})),
      sessionTasks: vi.fn(async () => ({ tasks: [] })),
      mcpServers: vi.fn(async () => ({ servers: [] })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/agent-tasks')) return { tasks: [] };
        if (path.includes('/context')) return { used_pct: 0 };
        if (path.includes('/artifacts')) return { artifacts: [] };
        if (path.includes('/trace')) return { events: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'Observability' }));
    await screen.findByRole('dialog', { name: /observability/i });

    const skeleton = await screen.findByTestId('kit-skeleton');
    expect(skeleton).toHaveAttribute('role', 'status');
    expect(skeleton).toHaveAccessibleName('Loading observability…');
  });
});
