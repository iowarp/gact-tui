import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  openUrl: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.openUrl }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import { openExternalUrl, openExternalUrlOrToast, prepareExternalUrl } from './external-url';

afterEach(() => vi.restoreAllMocks());

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

  it('does not mistake an isolated tab for a blocked popup', async () => {
    mocks.inTauri.mockReturnValue(false);
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openExternalUrl('https://auth.globus.org/example')).resolves.toBeUndefined();
  });

  it('reserves the tab synchronously and removes its opener before later navigation', async () => {
    mocks.inTauri.mockReturnValue(false);
    const replace = vi.fn();
    const popup = { opener: window, closed: false, location: { replace }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const pending = prepareExternalUrl();
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(popup.opener).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    await pending.open('https://auth.globus.org/example');
    expect(replace).toHaveBeenCalledWith('https://auth.globus.org/example');
  });

  it('closes an unused tab when authorization setup fails', () => {
    mocks.inTauri.mockReturnValue(false);
    const popup = { opener: window, closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    prepareExternalUrl().cancel();
    expect(popup.close).toHaveBeenCalledOnce();
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
