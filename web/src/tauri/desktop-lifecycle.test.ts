import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

import { DESKTOP_RESUMED_EVENT, listenForDesktopResume } from './desktop-lifecycle';

describe('desktop lifecycle bridge', () => {
  beforeEach(() => {
    mocks.inTauri.mockReset();
    mocks.listen.mockReset();
  });

  it('does not load native listeners in a browser session', async () => {
    mocks.inTauri.mockReturnValue(false);

    const unlisten = await listenForDesktopResume(vi.fn());

    expect(mocks.listen).not.toHaveBeenCalled();
    expect(unlisten()).toBeUndefined();
  });

  it('subscribes to the native resume event in the installed app', async () => {
    const onResume = vi.fn();
    const unlisten = vi.fn();
    mocks.inTauri.mockReturnValue(true);
    mocks.listen.mockResolvedValue(unlisten);

    await expect(listenForDesktopResume(onResume)).resolves.toBe(unlisten);
    expect(mocks.listen).toHaveBeenCalledWith(DESKTOP_RESUMED_EVENT, onResume);
  });
});
