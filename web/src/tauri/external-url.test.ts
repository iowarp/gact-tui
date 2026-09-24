import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  openUrl: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import { openExternalUrl, openExternalUrlOrToast } from './external-url';

describe('external URL bridge', () => {
  beforeEach(() => {
    mocks.inTauri.mockReset();
    mocks.openUrl.mockReset();
    mocks.toastError.mockReset();
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

describe('openExternalUrlOrToast', () => {
  beforeEach(() => {
    mocks.inTauri.mockReset();
    mocks.openUrl.mockReset();
    mocks.toastError.mockReset();
  });

  it('opens the URL without showing a toast on success', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.openUrl.mockResolvedValue(undefined);

    openExternalUrlOrToast('https://example.com');

    await vi.waitFor(() => expect(mocks.openUrl).toHaveBeenCalledWith('https://example.com'));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('reports a rejected open with a toast instead of an unhandled rejection', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.openUrl.mockRejectedValue(new Error('scope rejected the URL'));

    openExternalUrlOrToast('https://example.com');

    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('scope rejected the URL'));
  });
});
