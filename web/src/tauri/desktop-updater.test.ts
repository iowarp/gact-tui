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

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));

import { checkForDesktopUpdate, installDesktopUpdate } from './desktop-updater';

beforeEach(() => vi.clearAllMocks());

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
