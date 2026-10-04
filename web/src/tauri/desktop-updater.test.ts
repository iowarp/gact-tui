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
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
const channelMocks = vi.hoisted(() => ({
  getVersion: vi.fn(async () => '0.7.2'),
  latestRelease: vi.fn(async () => ({ tag_name: 'v0.9.5-beta.2' })),
  invoke: vi.fn(async () => ({
    rid: 42,
    currentVersion: '0.9.5-1',
    version: '0.9.5-2',
    rawJson: {},
  })),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mocks.check,
  Update: vi.fn(function (metadata) {
    return { ...mocks.update, ...metadata };
  }),
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: channelMocks.getVersion }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: channelMocks.invoke }));
vi.mock('@/lib/github-releases', () => ({ latestPublishedRelease: channelMocks.latestRelease }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));
vi.mock('sonner', () => ({ toast: sonnerMocks.toast }));

import {
  BACKGROUND_UPDATE_CHECK_INTERVAL_MS,
  BACKGROUND_UPDATE_CHECK_MIN_INTERVAL_MS,
} from '@/lib/runtime-limits';
import {
  checkForDesktopUpdate,
  classifyUpdateError,
  describeUpdateError,
  DESKTOP_UPDATE_TOAST_ID,
  installDesktopUpdate,
  runBackgroundUpdateCheck,
  scheduleBackgroundUpdateCheck,
  getDesktopUpdateSnapshot,
  isDesktopUpdateInstalling,
} from './desktop-updater';
import { setUpdateChannel } from '@/lib/update-channel';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setUpdateChannel('stable');
  channelMocks.getVersion.mockResolvedValue('0.7.2');
});

describe('desktop updater bridge', () => {
  it('protects an active installation from background checks and channel changes', async () => {
    await checkForDesktopUpdate();
    mocks.update.close.mockClear();
    let finish!: () => void;
    mocks.update.downloadAndInstall.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = installDesktopUpdate(() => undefined);
    expect(isDesktopUpdateInstalling()).toBe(true);
    await expect(checkForDesktopUpdate()).rejects.toThrow('already being installed');
    setUpdateChannel('beta');
    expect(mocks.update.close).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(mocks.update.close).toHaveBeenCalledOnce();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(isDesktopUpdateInstalling()).toBe(false);
  });

  it('discards a beta result that arrives after opting back into stable', async () => {
    setUpdateChannel('beta');
    let finish!: (value: {
      rid: number;
      currentVersion: string;
      version: string;
      rawJson: object;
    }) => void;
    channelMocks.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = checkForDesktopUpdate();
    await vi.waitFor(() => expect(channelMocks.invoke).toHaveBeenCalled());
    setUpdateChannel('stable');
    finish({ rid: 42, currentVersion: '0.9.5-1', version: '0.9.5-2', rawJson: {} });
    await expect(pending).resolves.toBeNull();
    expect(getDesktopUpdateSnapshot()).toEqual({ status: 'unknown' });
    await expect(installDesktopUpdate(() => undefined)).rejects.toThrow(
      'Check for an available update',
    );
  });

  it('uses a published beta manifest and preserves the native signature-verifying install path', async () => {
    setUpdateChannel('beta');
    await expect(checkForDesktopUpdate()).resolves.toMatchObject({ version: '0.9.5-2' });
    expect(channelMocks.latestRelease).toHaveBeenCalledWith(expect.any(String), 'beta');
    expect(channelMocks.invoke).toHaveBeenCalledWith('check_release_update', {
      tag: 'v0.9.5-beta.2',
    });
    expect(mocks.check).not.toHaveBeenCalled();
    setUpdateChannel('stable');
    await expect(installDesktopUpdate(() => undefined)).rejects.toThrow(
      'Check for an available update',
    );
  });

  it('migrates existing beta installations without overriding an explicit stable choice', async () => {
    localStorage.clear();
    channelMocks.getVersion.mockResolvedValue('0.9.5-1');
    await checkForDesktopUpdate();
    expect(channelMocks.invoke).toHaveBeenCalledOnce();
    setUpdateChannel('stable');
    await checkForDesktopUpdate();
    expect(mocks.check).toHaveBeenCalledOnce();
  });

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

  it('types every failure so the version panel can say what happened', () => {
    expect(
      classifyUpdateError(new Error('Could not fetch a valid release JSON from the remote')).reason,
    ).toBe('manifest_not_published');
    expect(
      classifyUpdateError(
        new Error('the platform `windows-x86_64` was not found in the response `platforms` object'),
      ).reason,
    ).toBe('platform_not_published');
    expect(classifyUpdateError(new Error('The signature verification failed')).reason).toBe(
      'signature_mismatch',
    );
    expect(classifyUpdateError(new Error('network unreachable'))).toEqual({
      reason: 'unreachable',
      message: 'network unreachable',
    });
  });

  it('records the typed reason on a failed check snapshot', async () => {
    mocks.check.mockRejectedValueOnce(
      new Error('Could not fetch a valid release JSON from the remote'),
    );

    await expect(checkForDesktopUpdate()).rejects.toThrow();

    const { getDesktopUpdateSnapshot } = await import('./desktop-updater');
    expect(getDesktopUpdateSnapshot()).toEqual({
      status: 'error',
      message: 'No update manifest published yet',
      reason: 'manifest_not_published',
    });
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
