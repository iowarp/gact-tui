import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
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
  DESKTOP_UPDATE_TOAST_ID,
  fetchLatestClioVersion,
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
  // Fixtures are the ACTUAL `Display` strings from the vendored
  // tauri-plugin-updater 2.10.1 / minisign-verify 0.2.5 crate sources
  // (src/error.rs, src/lib.rs) -- not guessed or paraphrased.
  it('manifest_404_message', () => {
    expect(
      describeUpdateError(new Error('Could not fetch a valid release JSON from the remote')),
    ).toBe('No update manifest published yet');
  });

  it('maps a platform missing from the manifest to its own message, distinct from a missing manifest', () => {
    expect(
      describeUpdateError(
        new Error('the platform `darwin-aarch64` was not found in the response `platforms` object'),
      ),
    ).toBe('No update published for this platform');
    expect(
      describeUpdateError(
        new Error(
          'None of the fallback platforms `["darwin-aarch64", "darwin-x86_64"]` were found in the response `platforms` object',
        ),
      ),
    ).toBe('No update published for this platform');
  });

  it('maps both minisign signature failure variants to the same rejection message', () => {
    expect(describeUpdateError(new Error('The signature verification failed'))).toBe(
      'Update rejected: signature mismatch',
    );
    expect(
      describeUpdateError(
        new Error('The signature was created with a different key than the one provided'),
      ),
    ).toBe('Update rejected: signature mismatch');
  });

  it('falls through to the real message for anything unrecognized, and to a fixed fallback for none', () => {
    expect(describeUpdateError(new Error('network unreachable'))).toBe('network unreachable');
    expect(describeUpdateError('not an Error instance')).toBe('not an Error instance');
  });

  it('surfaces the manifest_404 mapping from a real background check failure instead of a blank result', async () => {
    mocks.check.mockRejectedValueOnce(
      new Error('Could not fetch a valid release JSON from the remote'),
    );
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

  it('treats a future-dated stored timestamp as "never checked" instead of blocking forever', async () => {
    // A negative now-minus-stored gap (clock skew, a hand-edited or corrupted
    // value) must never permanently suppress checking.
    localStorage.setItem('clio.desktop-update.last-checked', String(Date.now() + 10_000_000));

    await runBackgroundUpdateCheck(Date.now());

    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it('records the manual check path against the same shared clock the background gate reads', async () => {
    vi.useFakeTimers();
    try {
      await checkForDesktopUpdate();
      expect(mocks.check).toHaveBeenCalledTimes(1);

      // Immediately after a manual check, a background check at "now" must
      // see it as already covered and skip -- not re-request the feed.
      await runBackgroundUpdateCheck();

      expect(mocks.check).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('background_check_schedules_and_toasts', async () => {
    vi.useFakeTimers();
    try {
      const cleanup = scheduleBackgroundUpdateCheck();
      await vi.advanceTimersByTimeAsync(0);

      expect(mocks.check).toHaveBeenCalledTimes(1);
      expect(sonnerMocks.toast).toHaveBeenCalledTimes(1);
      const [message, options] = sonnerMocks.toast.mock.calls[0] as [
        string,
        { id: string; action: { label: string; onClick: () => void } },
      ];
      expect(message).toContain('0.8.0');
      expect(options.id).toBe(DESKTOP_UPDATE_TOAST_ID);
      expect(options.action.label).toBe('Restart to update');

      options.action.onClick();
      await vi.advanceTimersByTimeAsync(0);

      // The toast itself becomes the progress indicator: an initial loading
      // state, then one update per progress event, all pinned to the same id
      // so they replace each other instead of stacking.
      expect(sonnerMocks.toast.loading).toHaveBeenCalledWith('Downloading update…', {
        id: DESKTOP_UPDATE_TOAST_ID,
      });
      expect(sonnerMocks.toast.loading).toHaveBeenCalledWith('Downloading update, 0%', {
        id: DESKTOP_UPDATE_TOAST_ID,
      });
      expect(sonnerMocks.toast.loading).toHaveBeenCalledWith('Downloading update, 40%', {
        id: DESKTOP_UPDATE_TOAST_ID,
      });
      expect(sonnerMocks.toast.loading).toHaveBeenCalledWith('Installing update…', {
        id: DESKTOP_UPDATE_TOAST_ID,
      });
      expect(mocks.relaunch).toHaveBeenCalledTimes(1);
      expect(sonnerMocks.toast.dismiss).toHaveBeenCalledWith(DESKTOP_UPDATE_TOAST_ID);

      await vi.advanceTimersByTimeAsync(BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
      expect(mocks.check.mock.calls.length).toBeGreaterThanOrEqual(2);
      // A re-fire still targets the same stable id, so sonner replaces the
      // existing toast rather than stacking a second one.
      for (const [, callOptions] of sonnerMocks.toast.mock.calls as Array<
        [string, { id: string }]
      >) {
        expect(callOptions.id).toBe(DESKTOP_UPDATE_TOAST_ID);
      }

      cleanup();
      mocks.check.mockClear();
      await vi.advanceTimersByTimeAsync(BACKGROUND_UPDATE_CHECK_INTERVAL_MS);
      expect(mocks.check).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dismisses the progress toast and reports the typed error when installation fails mid-restart', async () => {
    vi.useFakeTimers();
    try {
      mocks.update.downloadAndInstall.mockImplementationOnce(async () => {
        throw new Error('Could not fetch a valid release JSON from the remote');
      });
      const cleanup = scheduleBackgroundUpdateCheck();
      await vi.advanceTimersByTimeAsync(0);
      const [, options] = sonnerMocks.toast.mock.calls[0] as [
        string,
        { action: { onClick: () => void } },
      ];

      options.action.onClick();
      await vi.advanceTimersByTimeAsync(0);

      expect(sonnerMocks.toast.dismiss).toHaveBeenCalledWith(DESKTOP_UPDATE_TOAST_ID);
      expect(sonnerMocks.toast.error).toHaveBeenCalledWith('No update manifest published yet');
      expect(mocks.relaunch).not.toHaveBeenCalled();
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchLatestClioVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the version field out of the manifest at <releaseUrl>/latest/download/latest-lite.json', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ version: '0.9.4.17' }) });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchLatestClioVersion('https://github.com/iowarp/clio-agent/releases'),
    ).resolves.toBe('0.9.4.17');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://github.com/iowarp/clio-agent/releases/latest/download/latest-lite.json',
    );
  });

  it('resolves undefined -- never throws or fabricates a version -- with no release feed configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchLatestClioVersion(null)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves undefined on a non-OK response instead of guessing a version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchLatestClioVersion('https://example.test/releases')).resolves.toBeUndefined();
  });

  it('resolves undefined when the request itself throws (offline, CORS, DNS)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(fetchLatestClioVersion('https://example.test/releases')).resolves.toBeUndefined();
  });

  it('resolves undefined when the manifest has no usable version field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notes: 'no version here' }) }),
    );

    await expect(fetchLatestClioVersion('https://example.test/releases')).resolves.toBeUndefined();
  });
});
