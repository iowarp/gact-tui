import { vocab } from '@/lib/brand-vocabulary';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const update = {
    currentVersion: '0.7.2',
    version: '0.8.0',
    date: '2026-08-24T00:00:00Z',
    body: 'Improved workspace support.',
    close: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockImplementation(async (onEvent) => {
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

const runtimeMocks = vi.hoisted(() => ({
  has: vi.fn(async () => false),
  mode: vi.fn(async () => 'external'),
  version: vi.fn(async () => '0.7.2'),
  update: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  restart: vi.fn(async () => undefined),
}));
vi.mock('./managed-backend', () => ({
  hasManagedRuntime: runtimeMocks.has,
  managedRuntimeUpdateMode: runtimeMocks.mode,
  updateManagedClio: runtimeMocks.update,
  restartClio: runtimeMocks.restart,
}));

vi.mock('./clio-update-verification', () => ({ managedClioVersion: runtimeMocks.version }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mocks.check,
  Update: vi.fn(function (metadata) {
    return { ...mocks.update, ...metadata };
  }),
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: channelMocks.getVersion }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: channelMocks.invoke }));
vi.mock('@/lib/github-releases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github-releases')>()),
  latestPublishedRelease: channelMocks.latestRelease,
}));
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
import { readPendingUpdateMarker, useUpdateFlowStore } from '@/store/update-flow-store';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setUpdateChannel('stable');
  useUpdateFlowStore.getState().reset();
  channelMocks.getVersion.mockResolvedValue('0.7.2');
  runtimeMocks.has.mockResolvedValue(false);
  runtimeMocks.mode.mockResolvedValue('external');
  runtimeMocks.version.mockResolvedValue('0.7.2');
  mocks.update.version = '0.8.0';
});

describe('desktop updater bridge', () => {
  it('protects an active installation from background checks and channel changes', async () => {
    await checkForDesktopUpdate();
    mocks.update.close.mockClear();
    let finish!: () => void;
    mocks.update.download.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = installDesktopUpdate(() => undefined);
    expect(isDesktopUpdateInstalling()).toBe(true);
    await expect(checkForDesktopUpdate()).rejects.toThrow('already in progress');
    setUpdateChannel('beta');
    expect(mocks.update.close).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
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

describe('Desktop-owned runtime updates (#1777)', () => {
  it('blocks a stale Desktop notification while an agent update owns the runtime', async () => {
    await checkForDesktopUpdate();
    useUpdateFlowStore.getState().start('agent', '0.9.5-beta.7.1');
    await expect(installDesktopUpdate(() => undefined)).rejects.toThrow('already in progress');
    expect(runtimeMocks.mode).not.toHaveBeenCalled();
    expect(runtimeMocks.update).not.toHaveBeenCalled();
    expect(mocks.update.download).not.toHaveBeenCalled();
  });

  it('awaits the matching backend update before installing and restarts only once', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('writable');
    mocks.update.version = '0.9.5-7+1';
    await checkForDesktopUpdate();
    let finish!: () => void;
    runtimeMocks.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = installDesktopUpdate(() => undefined);
    await vi.waitFor(() =>
      expect(runtimeMocks.update).toHaveBeenCalledWith('v0.9.5-beta.7.1', {
        restartApp: false,
        onProgress: expect.any(Function),
      }),
    );
    expect(mocks.update.download).toHaveBeenCalledOnce();
    expect(mocks.update.install).not.toHaveBeenCalled();
    expect(useUpdateFlowStore.getState()).toMatchObject({ action: 'both', step: 'installing' });
    expect(readPendingUpdateMarker()).toMatchObject({ action: 'both', version: '0.9.5-beta.7.1' });
    finish();
    await pending;
    expect(mocks.update.download).toHaveBeenCalledOnce();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(runtimeMocks.restart).not.toHaveBeenCalled();
    expect(useUpdateFlowStore.getState().step).toBe('restarting');
  });

  it('keeps external and unowned runtimes outside the Desktop update', async () => {
    await checkForDesktopUpdate();
    await installDesktopUpdate(() => undefined);
    expect(runtimeMocks.update).not.toHaveBeenCalled();
    expect(mocks.update.download).toHaveBeenCalledOnce();
  });

  it('replaces bundled app and runtime through one signed payload', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('bundled');
    await checkForDesktopUpdate();
    await installDesktopUpdate(() => undefined);
    expect(runtimeMocks.update).not.toHaveBeenCalled();
    expect(mocks.update.download).toHaveBeenCalledOnce();
    expect(mocks.update.install).toHaveBeenCalledOnce();
    expect(readPendingUpdateMarker()).toMatchObject({ action: 'both', version: '0.8.0' });
  });

  it('does not change the runtime when signed download fails', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('writable');
    await checkForDesktopUpdate();
    mocks.update.download.mockRejectedValueOnce(new Error('Download failed'));
    await expect(installDesktopUpdate(() => undefined)).rejects.toThrow('Download failed');
    expect(runtimeMocks.update).not.toHaveBeenCalled();
    expect(mocks.update.install).not.toHaveBeenCalled();
    expect(readPendingUpdateMarker()).toBeUndefined();
  });

  it('offers the same action to repair an older runtime to the installed app', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('writable');
    runtimeMocks.version.mockResolvedValue('0.7.1');
    mocks.check.mockResolvedValueOnce(null);
    await expect(checkForDesktopUpdate()).resolves.toMatchObject({
      repair: true,
      version: '0.7.2',
    });
    await installDesktopUpdate(() => undefined);
    expect(runtimeMocks.update).toHaveBeenCalledWith(
      'v0.7.2',
      expect.objectContaining({ restartApp: false }),
    );
    expect(mocks.update.download).not.toHaveBeenCalled();
    expect(mocks.update.install).not.toHaveBeenCalled();
    expect(runtimeMocks.restart).toHaveBeenCalledOnce();
    expect(readPendingUpdateMarker()).toMatchObject({ action: 'both', version: '0.7.2' });
  });

  it('never silently downgrades a runtime newer than the signed app target', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('writable');
    runtimeMocks.version.mockResolvedValue('9.0.0');
    await expect(checkForDesktopUpdate()).rejects.toThrow('will not be downgraded');
    expect(runtimeMocks.update).not.toHaveBeenCalled();
    expect(mocks.update.install).not.toHaveBeenCalled();
  });

  it('repairs a bundled runtime by reinstalling the same signed app release', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('bundled');
    runtimeMocks.version.mockResolvedValue('0.7.1');
    mocks.check.mockResolvedValueOnce(null);
    channelMocks.invoke.mockResolvedValueOnce({
      rid: 42,
      currentVersion: '0.7.2',
      version: '0.7.2',
      rawJson: {},
    });
    await expect(checkForDesktopUpdate()).resolves.toMatchObject({
      repair: true,
      version: '0.7.2',
    });
    expect(channelMocks.invoke).toHaveBeenCalledWith('check_release_update', {
      tag: 'v0.7.2',
      repair: true,
    });
    await installDesktopUpdate(() => undefined);
    expect(mocks.update.download).toHaveBeenCalledOnce();
    expect(mocks.update.install).toHaveBeenCalledOnce();
    expect(runtimeMocks.update).not.toHaveBeenCalled();
    expect(readPendingUpdateMarker()).toMatchObject({ action: 'both', version: '0.7.2' });
  });

  it('does not change either component if restart intent cannot be saved', async () => {
    await checkForDesktopUpdate();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    try {
      await expect(installDesktopUpdate(() => undefined)).rejects.toThrow('cannot retain');
      expect(mocks.update.download).not.toHaveBeenCalled();
      expect(runtimeMocks.update).not.toHaveBeenCalled();
      expect(mocks.update.install).not.toHaveBeenCalled();
    } finally {
      set.mockRestore();
    }
  });

  it('keeps the target after an installer fails after it may have changed the app', async () => {
    await checkForDesktopUpdate();
    mocks.update.install.mockRejectedValueOnce(new Error('installer interrupted'));
    await expect(installDesktopUpdate(() => undefined)).rejects.toThrow('installer interrupted');
    expect(readPendingUpdateMarker()).toMatchObject({ version: '0.8.0' });
    expect(useUpdateFlowStore.getState().step).toBe('failed');
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  it('can repair an unavailable owned runtime using the signed app payload', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('bundled');
    runtimeMocks.version.mockRejectedValue(new Error('runtime unavailable'));
    try {
      await expect(checkForDesktopUpdate()).resolves.toMatchObject({ version: '0.8.0' });
      await installDesktopUpdate(() => undefined);
      expect(mocks.update.install).toHaveBeenCalledOnce();
      expect(runtimeMocks.update).not.toHaveBeenCalled();
      expect(readPendingUpdateMarker()).toMatchObject({ action: 'both', version: '0.8.0' });
    } finally {
      runtimeMocks.version.mockResolvedValue('0.7.2');
    }
  });

  it('halts the Desktop update on backend failure and restores the managed service', async () => {
    runtimeMocks.has.mockResolvedValue(true);
    runtimeMocks.mode.mockResolvedValue('writable');
    runtimeMocks.update.mockRejectedValueOnce(new Error('Backend import verification failed'));
    await checkForDesktopUpdate();
    await expect(installDesktopUpdate(() => undefined)).rejects.toThrow(
      'Backend import verification failed',
    );
    expect(mocks.update.download).toHaveBeenCalledOnce();
    expect(mocks.update.install).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(runtimeMocks.restart).toHaveBeenCalledOnce();
    expect(isDesktopUpdateInstalling()).toBe(false);
    expect(useUpdateFlowStore.getState().step).toBe('failed');
    expect(readPendingUpdateMarker()).toMatchObject({ action: 'both', version: '0.8.0' });
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
      expect(options.action.label).toBe(`Update ${vocab.agent}`);

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
      expect(mocks.check).toHaveBeenCalledOnce();
      // A real relaunch destroys this process. Here the restart is stubbed,
      // so explicitly finish verified recovery before the scheduler resumes.
      useUpdateFlowStore.getState().finish('0.8.0');
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
      mocks.update.download.mockImplementationOnce(async () => {
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
