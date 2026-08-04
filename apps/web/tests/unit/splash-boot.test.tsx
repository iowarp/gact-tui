/**
 * Slice F failing-first contract — splash + auto-probe boot (P5 inventory
 * F1–F2, semantics ported from web.old/src/routes/splashBackend.ts and
 * SplashScreen.tsx).
 *
 * The connect form is NEVER the default route. The app boots to a Splash that
 * probes candidates in order — current saved backend, other saved backends,
 * then the brand default on both host forms — and only falls back to the
 * connect card when every candidate fails.
 */
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackendEntry, BackendRegistryState } from '@clio/core';
import type { ConnectFailure, ConnectResult } from '../../src/backend/connection';
import { probeCandidates } from '../../src/connect/candidates';
import { Splash, PROBE_TIMEOUT_MS } from '../../src/connect/Splash';

function entry(overrides: Partial<BackendEntry> & { id: string; url: string }): BackendEntry {
  return { label: overrides.id, bearerToken: '', kind: 'http', ...overrides } as BackendEntry;
}

function state(backends: BackendEntry[], currentId: string | null = null): BackendRegistryState {
  return { backends, currentId };
}

const OK = (url: string): ConnectResult =>
  ({ kind: 'connected', url } as unknown as ConnectResult);
const FAIL: ConnectFailure = {
  kind: 'failed',
  reason: 'unreachable',
  detail: 'refused',
} as ConnectFailure;

describe('probeCandidates (F1)', () => {
  it('with no saved backends, probes the brand default on both host forms in order', () => {
    expect(probeCandidates(state([]), 17800)).toEqual([
      { url: 'http://127.0.0.1:17800', token: '' },
      { url: 'http://localhost:17800', token: '' },
    ]);
  });

  it('puts the current saved backend first, then the others, then the defaults', () => {
    const s = state(
      [
        entry({ id: 'a', url: 'http://a:1', bearerToken: 'ta' }),
        entry({ id: 'b', url: 'http://b:2', bearerToken: 'tb' }),
      ],
      'b',
    );
    expect(probeCandidates(s, 17800).map((c: { url: string }) => c.url)).toEqual([
      'http://b:2',
      'http://a:1',
      'http://127.0.0.1:17800',
      'http://localhost:17800',
    ]);
  });

  it('falls back to the first saved backend when none is selected, and dedupes', () => {
    const s = state([entry({ id: 'local', url: 'http://127.0.0.1:17800' })]);
    // The saved entry IS the brand default — it must not be probed twice.
    expect(probeCandidates(s, 17800)).toEqual([
      { url: 'http://127.0.0.1:17800', token: '' },
      { url: 'http://localhost:17800', token: '' },
    ]);
  });
});

describe('Splash (F1/F2)', () => {
  it('announces the boot and shows the brand, never a URL form', async () => {
    render(
      <Splash
        candidates={[{ url: 'http://127.0.0.1:17800', token: '' }]}
        connect={vi.fn(async () => FAIL)}
        onReady={vi.fn()}
        onFallback={vi.fn()}
      />,
    );
    expect(screen.getByTestId('splash-screen')).toBeInTheDocument();
    expect(screen.getByText(/starting your local agent/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('connects to the first candidate that answers and reports it ready', async () => {
    const connect = vi.fn(async (url: string) => (url === 'http://b:2' ? OK(url) : FAIL));
    const onReady = vi.fn();
    render(
      <Splash
        candidates={[
          { url: 'http://a:1', token: '' },
          { url: 'http://b:2', token: '' },
          { url: 'http://c:3', token: '' },
        ]}
        connect={connect}
        onReady={onReady}
        onFallback={vi.fn()}
      />,
    );
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    // Sequential, not parallel — and the probe stops at the first success.
    expect(connect.mock.calls.map(([u]) => u)).toEqual(['http://a:1', 'http://b:2']);
  });

  it('passes the candidate token through to the connect attempt', async () => {
    const connect = vi.fn(async (url: string, _token?: string) => OK(url));
    render(
      <Splash
        candidates={[{ url: 'http://a:1', token: 'secret' }]}
        connect={connect}
        onReady={vi.fn()}
        onFallback={vi.fn()}
      />,
    );
    await vi.waitFor(() => expect(connect).toHaveBeenCalled());
    expect(connect.mock.calls[0]?.[1]).toBe('secret');
  });

  it('falls back with the last typed failure when every candidate fails', async () => {
    const onFallback = vi.fn();
    render(
      <Splash
        candidates={[
          { url: 'http://a:1', token: '' },
          { url: 'http://b:2', token: '' },
        ]}
        connect={vi.fn(async () => FAIL)}
        onReady={vi.fn()}
        onFallback={onFallback}
      />,
    );
    await vi.waitFor(() => expect(onFallback).toHaveBeenCalledTimes(1));
    expect(onFallback.mock.calls[0]?.[0]).toMatchObject({ reason: 'unreachable' });
  });

  it('gives up on a hung candidate after the probe timeout and moves on', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<ConnectResult>(() => {});
      const connect = vi.fn((url: string) => (url === 'http://hung:1' ? never : Promise.resolve(OK(url))));
      const onReady = vi.fn();
      render(
        <Splash
          candidates={[
            { url: 'http://hung:1', token: '' },
            { url: 'http://b:2', token: '' },
          ]}
          connect={connect}
          onReady={onReady}
          onFallback={vi.fn()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 50);
      });
      expect(onReady).toHaveBeenCalledTimes(1);
      expect(connect.mock.calls.map(([u]) => u)).toEqual(['http://hung:1', 'http://b:2']);
    } finally {
      vi.useRealTimers();
    }
  });
});
