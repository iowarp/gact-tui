/**
 * Connection semantics the rebuild lost (S3 / S4 / S6).
 *
 * The legacy app had a saved-connections list and autoconnect; I replaced it
 * with a single-field connect box, which is a regression the owner caught.
 * `@clio/core` already ships the backend registry — these pin the surface that
 * uses it.
 *
 * The rail footer's "agents N" counts CONNECTED CLIO DEPLOYMENTS (a UI-owned
 * set, not a backend one), so an unrecorded connection makes that count lie.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectScreen } from '../../src/connect/ConnectScreen';
import type { BackendEntry } from '@clio/core';

afterEach(() => {
  localStorage.clear();
});

const SAVED: BackendEntry[] = [
  { id: 'b1', label: 'local', url: 'http://127.0.0.1:17900' },
  { id: 'b2', label: 'ares', url: 'http://ares.example:17900' },
] as unknown as BackendEntry[];

function props(overrides: Record<string, unknown> = {}) {
  return {
    initialUrl: 'http://127.0.0.1:17900',
    pending: false,
    failure: null,
    onConnect: vi.fn(),
    saved: [] as BackendEntry[],
    onForget: vi.fn(),
    ...overrides,
  };
}

describe('saved connections (S3)', () => {
  it('lists every saved backend', () => {
    render(<ConnectScreen {...props({ saved: SAVED })} />);
    const list = screen.getByRole('list', { name: /saved backends/i });
    expect(within(list).getByText('local')).toBeInTheDocument();
    expect(within(list).getByText('ares')).toBeInTheDocument();
  });

  it('connects to a saved backend by its url, not the typed field', () => {
    const onConnect = vi.fn();
    render(<ConnectScreen {...props({ saved: SAVED, onConnect })} />);
    fireEvent.click(screen.getByRole('button', { name: /connect to ares/i }));
    expect(onConnect).toHaveBeenCalledWith('http://ares.example:17900');
  });

  it('forgets a saved backend without connecting to it', () => {
    const onConnect = vi.fn();
    const onForget = vi.fn();
    render(<ConnectScreen {...props({ saved: SAVED, onConnect, onForget })} />);
    fireEvent.click(screen.getByRole('button', { name: /forget ares/i }));
    expect(onForget).toHaveBeenCalledWith('http://ares.example:17900');
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('says so when nothing is saved rather than rendering an empty list', () => {
    render(<ConnectScreen {...props()} />);
    expect(screen.queryByRole('list', { name: /saved backends/i })).toBeNull();
  });
});

describe('connecting feedback (S4)', () => {
  it('announces progress instead of freezing', () => {
    // The owner's report: "instead of freezing, you know, good ui/ux has
    // feedback". A disabled button reading "Connecting…" is not feedback that
    // anything is still happening.
    render(<ConnectScreen {...props({ pending: true })} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/connecting/i);
    expect(screen.getByTestId('connect-progress')).toBeInTheDocument();
  });

  it('marks the form busy while connecting', () => {
    render(<ConnectScreen {...props({ pending: true })} />);
    expect(screen.getByTestId('connect-screen')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows no progress indicator when idle', () => {
    render(<ConnectScreen {...props()} />);
    expect(screen.queryByTestId('connect-progress')).toBeNull();
  });

  it('a saved row is not clickable mid-connect', () => {
    const onConnect = vi.fn();
    render(<ConnectScreen {...props({ saved: SAVED, pending: true, onConnect })} />);
    fireEvent.click(screen.getByRole('button', { name: /connect to ares/i }));
    expect(onConnect).not.toHaveBeenCalled();
  });
});
