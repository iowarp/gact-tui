/**
 * Connect screen — remote-backend reauth affordance.
 *
 * When connecting to a REMOTE / federated backend (a non-loopback host)
 * fails with an auth error (401 / 403), the connect form must offer a
 * "Re-enter credentials" action (testid `splash-reauth`) that routes the
 * user back to entering a fresh token — instead of leaving a bare HTTP
 * error.
 *
 * IMPORTANT scoping (asserted here): this is for remote bearer/SSH-tunnelled
 * backend HTTP auth only. A LOCAL backend (localhost / 127.0.0.1) returning
 * 401/403 must NOT show the reauth affordance — the bundled local clio's
 * model-provider token is maintained externally and is never re-auth'd from
 * the UI.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectScreen } from '../../src/routes/ConnectScreen.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const REMOTE_URL = 'https://clio-staging.example.com';

function stubFetchStatus(status: number) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('{"error":"unauthorized"}', { status }),
  );
}

function mount() {
  const onConnected = vi.fn();
  render(() => <ConnectScreen onConnected={onConnected} />);
  return { onConnected };
}

function setUrl(value: string) {
  const input = screen.getByTestId('connect-url') as HTMLInputElement;
  fireEvent.input(input, { target: { value } });
}

describe('ConnectScreen remote reauth', () => {
  it('offers Re-enter credentials on a 401 from a REMOTE backend', async () => {
    stubFetchStatus(401);
    mount();
    setUrl(REMOTE_URL);
    screen.getByTestId('connect-submit').click();

    await waitFor(() => {
      expect(screen.getByTestId('connect-reauth')).toBeTruthy();
      expect(screen.getByTestId('splash-reauth')).toBeTruthy();
    });
  });

  it('offers Re-enter credentials on a 403 from a REMOTE backend', async () => {
    stubFetchStatus(403);
    mount();
    setUrl(REMOTE_URL);
    screen.getByTestId('connect-submit').click();

    await waitFor(() => {
      expect(screen.getByTestId('splash-reauth')).toBeTruthy();
    });
  });

  it('does NOT offer reauth for a LOCAL backend 401 (local LM token is external)', async () => {
    stubFetchStatus(401);
    mount();
    // Default URL is http://127.0.0.1:17800 — a local backend.
    screen.getByTestId('connect-submit').click();

    await waitFor(() => {
      // The generic error appears, but no reauth affordance.
      expect(screen.getByTestId('connect-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('connect-reauth')).toBeNull();
    expect(screen.queryByTestId('splash-reauth')).toBeNull();
  });

  it('does NOT offer reauth for a non-auth remote failure (e.g. 404/500)', async () => {
    stubFetchStatus(500);
    mount();
    setUrl(REMOTE_URL);
    screen.getByTestId('connect-submit').click();

    await waitFor(() => {
      expect(screen.getByTestId('connect-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('connect-reauth')).toBeNull();
  });

  it('Re-enter credentials clears the token and dismisses the reauth banner', async () => {
    stubFetchStatus(401);
    mount();
    setUrl(REMOTE_URL);
    const token = screen.getByTestId('connect-token') as HTMLInputElement;
    fireEvent.input(token, { target: { value: 'stale-token' } });

    screen.getByTestId('connect-submit').click();
    await waitFor(() => expect(screen.getByTestId('splash-reauth')).toBeTruthy());

    screen.getByTestId('splash-reauth').click();
    await waitFor(() => {
      expect(screen.queryByTestId('connect-reauth')).toBeNull();
    });
    expect((screen.getByTestId('connect-token') as HTMLInputElement).value).toBe('');
  });
});
