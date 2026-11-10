import { afterEach, describe, expect, it, vi } from 'vitest';

const desktop = vi.hoisted(() => ({
  inTauri: true,
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => desktop.inTauri }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: desktop.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    desktop.listeners.set(name, handler);
    return () => desktop.listeners.delete(name);
  }),
}));

import {
  listenForNotificationOpen,
  requestNotificationPermission,
  setAttentionBadge,
  showSystemNotice,
} from './system-notifications';

afterEach(() => {
  desktop.invoke.mockReset();
  desktop.listeners.clear();
  vi.unstubAllGlobals();
});

describe('system notifications in the desktop app', () => {
  it('posts through the app, never the Notification global the plugin replaces', async () => {
    const shim = vi.fn();
    vi.stubGlobal('Notification', shim);
    desktop.invoke.mockResolvedValue({ shown: true, sound: true });

    const notice = {
      id: 'clio-attention:sess_1',
      title: 'Question for you',
      body: 'Session One',
      path: '/workspaces/ws_1/sessions/sess_1',
      sound: true,
    };
    await expect(showSystemNotice(notice)).resolves.toEqual({ shown: true, sound: true });
    expect(desktop.invoke).toHaveBeenCalledWith('show_notification', { notice });
    expect(shim).not.toHaveBeenCalled();
  });

  it('reports a host that cannot notify instead of throwing', async () => {
    desktop.invoke.mockRejectedValue(new Error('unknown command'));
    await expect(requestNotificationPermission()).resolves.toBe('unsupported');
    await expect(
      showSystemNotice({ id: 'x', title: 't', path: '/', sound: false }),
    ).resolves.toEqual({ shown: false, sound: false });
  });

  it('opens a clicked banner and one clicked before the page listened', async () => {
    desktop.invoke.mockImplementation(async (command: string) =>
      command === 'take_notification_open' ? '/workspaces/ws_1/sessions/early' : undefined,
    );
    const open = vi.fn();
    const stop = listenForNotificationOpen(open);
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('/workspaces/ws_1/sessions/early'));

    desktop.listeners.get('clio:notification-open')?.({
      payload: { path: '/workspaces/ws_1/sessions/later' },
    });
    expect(open).toHaveBeenCalledWith('/workspaces/ws_1/sessions/later');

    // Only in-app routes.
    desktop.listeners.get('clio:notification-open')?.({ payload: { path: 'https://x.test' } });
    expect(open).toHaveBeenCalledTimes(2);
    stop();
  });

  it('sets the Dock badge to the waiting count', async () => {
    desktop.invoke.mockResolvedValue(undefined);
    setAttentionBadge(3);
    await vi.waitFor(() =>
      expect(desktop.invoke).toHaveBeenCalledWith('set_attention_badge', { count: 3 }),
    );
  });
});
