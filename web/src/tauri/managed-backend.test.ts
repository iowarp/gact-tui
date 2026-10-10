import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GACT_HTTP_TIMEOUT_MS } from '@/lib/runtime-limits';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, listener: (payload: { payload: unknown }) => void) => {
    mocks.listeners.set(event, listener);
    return () => mocks.listeners.delete(event);
  }),
}));

import {
  restartClio,
  retryManagedBackend,
  updateManagedClio,
  waitForManagedBackend,
} from './managed-backend';

describe('managed Tauri backend', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listeners.clear();
  });

  it('polls the supervisor until its discovered endpoint is ready', async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        url: '',
        bearer_token: '',
        status: { kind: 'starting', detail: 'checking_existing' },
      })
      .mockResolvedValueOnce({
        url: 'http://127.0.0.1:17800',
        bearer_token: 'native-token',
        status: { kind: 'ready' },
      });

    await expect(waitForManagedBackend({ pollIntervalMs: 0 })).resolves.toMatchObject({
      url: 'http://127.0.0.1:17800',
      bearer_token: 'native-token',
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'get_backend');
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'get_backend');
  });

  it('surfaces an unresponsive native command instead of waiting forever', async () => {
    vi.useFakeTimers();
    mocks.invoke.mockImplementation(() => new Promise(() => {}));
    const rejected = expect(waitForManagedBackend()).rejects.toThrow(
      'did not respond to the local service request',
    );
    await vi.advanceTimersByTimeAsync(GACT_HTTP_TIMEOUT_MS);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs first-use installation once before resuming supervisor polling', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ url: '', bearer_token: '', status: { kind: 'needs_install' } })
      .mockImplementationOnce(async () => {
        mocks.listeners.get('clio:install-done')?.({ payload: undefined });
      })
      .mockResolvedValueOnce({
        url: '',
        bearer_token: '',
        status: { kind: 'starting', detail: 'starting_service' },
      })
      .mockResolvedValueOnce({
        url: 'http://127.0.0.1:17800',
        bearer_token: '',
        status: { kind: 'ready' },
      });

    await expect(waitForManagedBackend({ pollIntervalMs: 0 })).resolves.toMatchObject({
      url: 'http://127.0.0.1:17800',
    });
    expect(mocks.invoke.mock.calls).toEqual([
      ['get_backend'],
      ['install_clio'],
      ['get_backend'],
      ['get_backend'],
    ]);
  });

  it('separates package preparation from the service-readiness deadline', async () => {
    vi.useFakeTimers();
    let preparing = true;
    mocks.invoke.mockImplementation(async () =>
      preparing
        ? { url: '', bearer_token: '', status: { kind: 'starting', detail: 'installing_runtime' } }
        : { url: 'http://127.0.0.1:17800', bearer_token: '', status: { kind: 'ready' } },
    );
    const ready = waitForManagedBackend({
      pollIntervalMs: 10,
      timeoutMs: 20,
      prepareTimeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(50);
    preparing = false;
    await vi.advanceTimersByTimeAsync(10);
    await expect(ready).resolves.toMatchObject({ status: { kind: 'ready' } });
  });

  it('still fails a package-preparation stall within its own budget', async () => {
    vi.useFakeTimers();
    mocks.invoke.mockResolvedValue({
      url: '',
      bearer_token: '',
      status: { kind: 'starting', detail: 'installing_runtime' },
    });
    const failed = expect(
      waitForManagedBackend({ pollIntervalMs: 10, prepareTimeoutMs: 30 }),
    ).rejects.toThrow('did not become ready in time');
    await vi.advanceTimersByTimeAsync(40);
    await failed;
  });

  it('surfaces a failed first-use install instead of waiting out the readiness window', async () => {
    const needsInstall = { url: '', bearer_token: '', status: { kind: 'needs_install' } };
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'install_clio') {
        mocks.listeners.get('clio:install-failed')?.({
          payload: { code: 1, tail: 'sidecar-launcher: clio-agent-gact not found' },
        });
        return undefined;
      }
      return needsInstall;
    });

    await expect(waitForManagedBackend({ pollIntervalMs: 0, timeoutMs: 50 })).rejects.toThrow(
      'could not be installed: sidecar-launcher: clio-agent-gact not found',
    );
    expect(mocks.invoke.mock.calls.filter(([command]) => command === 'install_clio')).toHaveLength(
      1,
    );
    expect(mocks.listeners.size).toBe(0);
  });

  it('does not cut off a first-use install that outlasts the readiness window', async () => {
    let installed = false;
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'install_clio') {
        setTimeout(() => {
          installed = true;
          mocks.listeners.get('clio:install-done')?.({ payload: undefined });
        }, 40);
        return undefined;
      }
      return installed
        ? { url: 'http://127.0.0.1:17800', bearer_token: '', status: { kind: 'ready' } }
        : { url: '', bearer_token: '', status: { kind: 'needs_install' } };
    });

    await expect(
      waitForManagedBackend({ pollIntervalMs: 0, timeoutMs: 10 }),
    ).resolves.toMatchObject({ url: 'http://127.0.0.1:17800' });
    expect(mocks.listeners.size).toBe(0);
  });

  it('publishes a typed supervisor failure instead of falling back to port 8787', async () => {
    mocks.invoke.mockResolvedValue({
      url: '',
      bearer_token: '',
      status: { kind: 'error', detail: 'Sidecar exited before readiness.' },
    });

    await expect(waitForManagedBackend({ pollIntervalMs: 0 })).rejects.toThrow(
      'Sidecar exited before readiness.',
    );
  });

  it('invokes the native restart command', async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);

    await expect(restartClio()).resolves.toBeUndefined();
    expect(mocks.invoke).toHaveBeenCalledWith('restart_clio');
  });

  it('retries the managed backend spawn pipeline in place', async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);

    await expect(retryManagedBackend()).resolves.toBeUndefined();
    expect(mocks.invoke).toHaveBeenCalledWith('retry_backend');
  });

  it('waits for verified agent completion and passes the combined-restart policy', async () => {
    mocks.invoke.mockImplementationOnce(async () => {
      mocks.listeners.get('clio:install-done')?.({ payload: undefined });
    });

    await expect(updateManagedClio('v0.9.4.3', { restartApp: false })).resolves.toBeUndefined();
    expect(mocks.invoke).toHaveBeenCalledWith('update_clio', {
      targetVersion: 'v0.9.4.3',
      restartApp: false,
    });
    expect(mocks.listeners.size).toBe(0);
  });

  it('forwards streamed install-progress lines and unsubscribes once settled', async () => {
    const lines: string[] = [];
    mocks.invoke.mockImplementationOnce(async () => {
      mocks.listeners.get('clio:install-progress')?.({
        payload: { line: 'Installing clio-agent...' },
      });
      mocks.listeners.get('clio:install-progress')?.({
        payload: { line: 'Successfully installed clio-agent-0.9.4.3' },
      });
      mocks.listeners.get('clio:install-done')?.({ payload: undefined });
    });

    await expect(
      updateManagedClio('v0.9.4.3', { restartApp: false, onProgress: (line) => lines.push(line) }),
    ).resolves.toBeUndefined();

    expect(lines).toEqual([
      'Installing clio-agent...',
      'Successfully installed clio-agent-0.9.4.3',
    ]);
    expect(mocks.listeners.size).toBe(0);
  });

  it('never subscribes to install-progress when no onProgress callback is given', async () => {
    let subscribedDuringInstall = true;
    mocks.invoke.mockImplementationOnce(async () => {
      subscribedDuringInstall = mocks.listeners.has('clio:install-progress');
      mocks.listeners.get('clio:install-done')?.({ payload: undefined });
    });

    await updateManagedClio('v0.9.4.3', { restartApp: false });

    expect(subscribedDuringInstall).toBe(false);
  });

  it('surfaces the native update failure tail', async () => {
    mocks.invoke.mockImplementationOnce(async () => {
      mocks.listeners.get('clio:install-failed')?.({
        payload: { code: 1, tail: 'verification failed' },
      });
    });

    await expect(updateManagedClio('v0.9.4.3', { restartApp: true })).rejects.toThrow(
      'verification failed',
    );
  });

  it('stops with a typed reason when it attached to an agent it cannot sign in to (#1478)', async () => {
    mocks.invoke.mockResolvedValueOnce({
      url: 'http://127.0.0.1:17800',
      bearer_token: '',
      status: { kind: 'auth_unavailable', detail: 'it did not publish its access token' },
    });

    await expect(waitForManagedBackend({ pollIntervalMs: 0 })).rejects.toThrow(
      /already running at http:\/\/127\.0\.0\.1:17800, but this app can't sign in to it: it did not publish its access token/u,
    );
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
