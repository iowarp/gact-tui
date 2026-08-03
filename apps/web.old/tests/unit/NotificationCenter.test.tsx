/**
 * 1.0 item 8 — Notification-center search + tone filter.
 *
 * Also covers the `silent` toast option that backs it (history-only
 * entries that never render a visible toast).
 */
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider, useToast, type ToastTone } from '../../src/components/Toast.js';
import { NotificationCenter } from '../../src/components/NotificationCenter.js';

afterEach(cleanup);

const SEED: Array<{ title: string; body?: string; tone: ToastTone }> = [
  { title: 'CLIO responded', body: 'turn completed in 12s', tone: 'success' },
  { title: 'Send failed', body: 'network unreachable', tone: 'error' },
  { title: 'Permission requested', body: 'WriteFile wants access', tone: 'warn' },
  { title: 'SSE reconnected', body: 'stream re-established', tone: 'info' },
];

/** Pushes the seed entries (silently) on mount, then renders the bell. */
function Harness() {
  const toast = useToast();
  for (const s of SEED) toast.push({ ...s, silent: true });
  return <NotificationCenter />;
}

function mount() {
  render(() => (
    <ToastProvider>
      <Harness />
    </ToastProvider>
  ));
  // Open the bell popover.
  fireEvent.click(screen.getByTestId('notification-bell'));
}

describe('Notification center search/filter (1.0 item 8)', () => {
  it('silent pushes land in history without visible toasts', () => {
    mount();
    // All four seeded entries are listed…
    expect(screen.getByText('CLIO responded')).toBeTruthy();
    expect(screen.getByText('Send failed')).toBeTruthy();
    // …but no visible toast was rendered for them.
    const host = screen.getByTestId('toast-host');
    expect(host.querySelectorAll('.toast').length).toBe(0);
  });

  it('search fuzzy-matches titles', () => {
    mount();
    const input = screen.getByTestId('notification-search');
    fireEvent.input(input, { target: { value: 'fail' } });
    expect(screen.getByText('Send failed')).toBeTruthy();
    expect(screen.queryByText('CLIO responded')).toBeNull();
    expect(screen.queryByText('SSE reconnected')).toBeNull();
  });

  it('search matches body text as a secondary field', () => {
    mount();
    const input = screen.getByTestId('notification-search');
    fireEvent.input(input, { target: { value: 'unreachable' } });
    // "unreachable" only appears in the Send failed body.
    expect(screen.getByText('Send failed')).toBeTruthy();
    expect(screen.queryByText('Permission requested')).toBeNull();
  });

  it('tone chips filter by tone', () => {
    mount();
    fireEvent.click(screen.getByTestId('notification-tone-error'));
    expect(screen.getByText('Send failed')).toBeTruthy();
    expect(screen.queryByText('CLIO responded')).toBeNull();
    expect(screen.queryByText('Permission requested')).toBeNull();
    // Switching back to All restores everything.
    fireEvent.click(screen.getByTestId('notification-tone-all'));
    expect(screen.getByText('CLIO responded')).toBeTruthy();
  });

  it('shows a no-match empty state', () => {
    mount();
    const input = screen.getByTestId('notification-search');
    fireEvent.input(input, { target: { value: 'zzzzqqqq' } });
    expect(screen.getByTestId('notification-no-match')).toBeTruthy();
  });

  it('combines tone filter and search', () => {
    mount();
    fireEvent.click(screen.getByTestId('notification-tone-success'));
    const input = screen.getByTestId('notification-search');
    fireEvent.input(input, { target: { value: 'responded' } });
    expect(screen.getByText('CLIO responded')).toBeTruthy();
    // "reconnected" would fuzzy-match "responded"? No — but even if the
    // query matched, the tone filter (success) excludes the info entry.
    expect(screen.queryByText('SSE reconnected')).toBeNull();
  });

  it('non-silent pushes still render visible toasts (regression)', () => {
    function Pusher() {
      const toast = useToast();
      toast.push({ title: 'Visible one', tone: 'info' });
      return <div />;
    }
    render(() => (
      <ToastProvider>
        <Pusher />
      </ToastProvider>
    ));
    const host = screen.getByTestId('toast-host');
    expect(host.querySelectorAll('.toast').length).toBe(1);
  });
});
