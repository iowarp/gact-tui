import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const update = {
    currentVersion: '0.7.2',
    version: '0.8.0',
    date: '2026-08-24T00:00:00Z',
    body: 'Improved workspace support.',
    close: vi.fn().mockResolvedValue(undefined),
    downloadAndInstall: vi.fn().mockImplementation(async (onEvent) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 40 } });
      onEvent({ event: 'Finished' });
    }),
  };
  return {
    check: vi.fn().mockResolvedValue(update),
    relaunch: vi.fn().mockResolvedValue(undefined),
    update,
  };
});

const sonnerMocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));
vi.mock('sonner', () => ({ toast: sonnerMocks.toast }));

import {
  BACKGROUND_UPDATE_CHECK_INTERVAL_MS,
  BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS,
} from '@/lib/runtime-limits';
import {
  checkForDesktopUpdate,
  describeUpdateError,
  installDesktopUpdate,
  runBackgroundUpdateCheck,
  scheduleBackgroundUpdateCheck,
} from './desktop-updater';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('desktop updater bridge', () => {
  it('checks the signed feed, reports real byte progress, installs, and relaunches', async () => {
    await expect(checkForDesktopUpdate()).resolves.toMatchObject({
      currentVersion: '0.7.2',
      version: '0.8.0',
    });
    const progress: Array<{ downloadedBytes: number; totalBytes?: number; finished: boolean }> = [];

    await installDesktopUpdate((value) => progress.push(value));

    expect(progress).toEqual([
      { downloadedBytes: 0, totalBytes: 100, finished: false },
      { downloadedBytes: 40, totalBytes: 100, finished: false },
      { downloadedBytes: 40, totalBytes: 100, finished: true },
    ]);
    expect(mocks.update.close).toHaveBeenCalled();
    expect(mocks.relaunch).toHaveBeenCalled();
  });
});

describe('describeUpdateError', () => {
  it('manifest_404_message', () => {
    expect(describeUpdateError(new Error('Failed with status code 404 Not Found'))).toBe(
      'No update manifest published yet',
    );
    expect(describeUpdateError(new Error('signature verification failed'))).toBe(
      'Update rejected: signature mismatch',
    );
    expect(describeUpdateError(new Error('network unreachable'))).toBe('network unreachable');
    expect(describeUpdateError('not an Error instance')).toBe('not an Error instance');
  });

  it('surfaces the 404 mapping from a real background check failure instead of a blank result', async () => {
    mocks.check.mockRejectedValueOnce(new Error('Failed with status code 404: Not Found'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await runBackgroundUpdateCheck(BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS);

    expect(warnSpy).toHaveBeenCalledWith(
      'Background update check failed:',
      'No update manifest published yet',
    );
    expect(sonnerMocks.toast).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('background update scheduling', () => {
  it('min_interval_respected', async () => {
    localStorage.setItem('clio.desktop-update.last-checked', '1000');

    await runBackgroundUpdateCheck(1000 + BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS - 1);
    expect(mocks.check).not.toHaveBeenCalled();

    await runBackgroundUpdateCheck(1000 + BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS);
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it('background_check_schedules_and_toasts', async () => {
    vi.useFakeTimers();
    try {
      const cleanup = scheduleBackgroundUpdateCheck();
      await vi.advanceTimersByTimeAsync(0);

      expect(mocks.check).toHaveBeenCalledTimes(1);
      expect(sonnerMocks.toast).toHaveBeenCalledTimes(1);
      const [message, options] = sonnerMocks.toast.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
      expect(message).toContain('0.8.0');
      expect(options.action.label).toBe('Restart to update');

      options.action.onClick();
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.relaunch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
      expect(mocks.check.mock.calls.length).toBeGreaterThanOrEqual(2);

      cleanup();
      mocks.check.mockClear();
      await vi.advanceTimersByTimeAsync(BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
      expect(mocks.check).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
