import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));

import { openExternalUrl } from './external-url';

describe('external URL bridge', () => {
  beforeEach(() => {
    mocks.inTauri.mockReset();
    mocks.openUrl.mockReset();
  });

  it('uses the native opener in the desktop app', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.openUrl.mockResolvedValue(undefined);

    await openExternalUrl('https://auth.globus.org/example');

    expect(mocks.openUrl).toHaveBeenCalledWith('https://auth.globus.org/example');
  });

  it('uses a new browser tab outside Tauri', async () => {
    mocks.inTauri.mockReturnValue(false);
    const open = vi.spyOn(window, 'open').mockReturnValue(window);

    await openExternalUrl('https://auth.globus.org/example');

    expect(open).toHaveBeenCalledWith(
      'https://auth.globus.org/example',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
