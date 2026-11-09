import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({
  attentionSound: 'background' as 'off' | 'background' | 'always',
  desktopNotifications: false,
  setAttentionSound: vi.fn(),
  setDesktopNotifications: vi.fn(),
}));
const sound = vi.hoisted(() => ({ playAttentionSound: vi.fn() }));
const toast = vi.hoisted(() => ({ dismiss: vi.fn(), error: vi.fn(), success: vi.fn() }));

vi.mock('@/providers/notification-preferences-provider', () => ({
  useNotificationPreferences: () => preferences,
}));
vi.mock('@/lib/attention-sound', () => sound);
vi.mock('sonner', () => ({ toast }));

import { TooltipProvider } from '@/components/ui/tooltip';
import { NotificationSettings } from './settings-notifications';

function renderNotifications() {
  return render(
    <TooltipProvider>
      <NotificationSettings />
    </TooltipProvider>,
  );
}

function stubNotification(permission: NotificationPermission, answer = permission) {
  const requestPermission = vi.fn().mockResolvedValue(answer);
  vi.stubGlobal(
    'Notification',
    Object.assign(function Notification() {}, { permission, requestPermission }),
  );
  return requestPermission;
}

beforeEach(() => {
  vi.clearAllMocks();
  preferences.attentionSound = 'background';
  preferences.desktopNotifications = false;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotificationSettings', () => {
  it('chooses when the sound plays and plays a test chime', async () => {
    stubNotification('default');
    sound.playAttentionSound.mockResolvedValue(false);
    renderNotifications();

    expect(screen.getByRole('radio', { name: 'In background' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Always' }));
    expect(preferences.setAttentionSound).toHaveBeenCalledWith('always');

    fireEvent.click(screen.getByRole('button', { name: 'Play test sound' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('This browser could not play the attention sound'),
    );
    expect(screen.getByText(/opens this page/)).toBeVisible();
    expect(screen.getByRole('img', { name: 'Notification settings' })).toBeInTheDocument();
  });

  it('asks for permission before turning desktop alerts on', async () => {
    const requestPermission = stubNotification('default', 'granted');
    renderNotifications();

    fireEvent.click(screen.getByRole('combobox', { name: 'Desktop alerts' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Needs you' }));

    await waitFor(() => expect(preferences.setDesktopNotifications).toHaveBeenCalledWith(true));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('keeps alerts off and says why when the browser blocks them', async () => {
    stubNotification('denied');
    renderNotifications();

    expect(screen.getByText('Blocked in browser settings')).toBeVisible();
    fireEvent.click(screen.getByRole('combobox', { name: 'Desktop alerts' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Needs you' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Desktop notifications were not enabled',
        expect.anything(),
      ),
    );
    expect(preferences.setDesktopNotifications).not.toHaveBeenCalled();
  });
});
