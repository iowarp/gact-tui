import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { restartClio, retryManagedBackend, waitForManagedBackend } from './managed-backend';

describe('managed Tauri backend', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
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

  it('runs first-use installation once before resuming supervisor polling', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ url: '', bearer_token: '', status: { kind: 'needs_install' } })
      .mockResolvedValueOnce(undefined)
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
});
