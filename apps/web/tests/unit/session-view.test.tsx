/**
 * The connected app must render the REBUILT SHELL over live data.
 *
 * Until now the shell existed only behind `?shell` with fixtures, so
 * connecting to a real backend landed on a placeholder list. These cases pin
 * the real path: connect -> shell -> select a session -> its messages render
 * through the one transcript pipeline.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
  { id: 'sess_b', title: 'membudget 1', status: 'idle', workspace_id: 'ws_default' },
  { id: 'sess_c', title: 'skill gate', status: 'idle', workspace_id: 'ws_other' },
] as unknown as Session[];

const MESSAGES: Message[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'plot the station' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'staging the CSV' }] },
] as unknown as Message[];

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    ...overrides,
  } as unknown as Client;
}

describe('SessionView', () => {
  it('renders the rebuilt shell, not a placeholder list', () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    expect(screen.getByRole('navigation', { name: /workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('groups sessions by workspace', () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    const rail = screen.getByRole('navigation', { name: /workspaces/i });
    expect(within(rail).getByText('ws_default')).toBeInTheDocument();
    expect(within(rail).getByText('ws_other')).toBeInTheDocument();
  });

  it('loads a session and renders its messages through the transcript', async () => {
    const client = makeClient();
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByText('staging the CSV')).toBeInTheDocument());
    expect(client.messages).toHaveBeenCalledWith('sess_a');
  });

  it('states when a session has no messages rather than showing an empty pane', async () => {
    const client = makeClient({ messages: vi.fn(async () => ({ messages: [] })) });
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'membudget 1' }));
    await waitFor(() => expect(screen.getByTestId('transcript-empty')).toBeInTheDocument());
  });

  it('surfaces a load failure with its reason instead of a blank transcript', async () => {
    // A failed fetch must not look like an empty session.
    const client = makeClient({
      messages: vi.fn(async () => {
        throw new Error('HTTP 500: session store unreadable');
      }),
    });
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'skill gate' }));
    await waitFor(() => {
      const err = screen.getByTestId('transcript-error');
      expect(err).toHaveTextContent(/500|unreadable/);
    });
  });

  it('says so when the backend serves no sessions at all', () => {
    render(<SessionView client={makeClient()} sessions={[]} />);
    expect(screen.getByTestId('sessions-empty')).toBeInTheDocument();
  });
});
