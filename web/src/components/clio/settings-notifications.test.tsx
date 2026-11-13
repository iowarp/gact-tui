import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({
  attentionSound: 'background' as 'off' | 'background' | 'always',
  desktopNotifications: false,
  finishedWork: 'bell' as 'bell' | 'desktop' | 'off',
  setAttentionSound: vi.fn(),
  setDesktopNotifications: vi.fn(),
  setFinishedWork: vi.fn(),
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
  preferences.finishedWork = 'bell';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotificationSettings', () => {
  it('offers to allow notifications the system has not been asked about yet', async () => {
    const requestPermission = stubNotification('default', 'granted');
    preferences.desktopNotifications = true;
    renderNotifications();

    expect(await screen.findByText('Not allowed yet')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
  });

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

  it('asks for permission before adding desktop alerts to finished work', async () => {
    const requestPermission = stubNotification('default', 'granted');
    renderNotifications();

    const finished = screen.getByRole('combobox', { name: 'Finished work' });
    // The visible value; the field also holds invisible copies of every choice for its width.
    expect(finished).toHaveAttribute('title', 'Bell only');
    fireEvent.click(finished);
    fireEvent.click(await screen.findByRole('option', { name: 'Desktop alert' }));

    await waitFor(() => expect(preferences.setFinishedWork).toHaveBeenCalledWith('desktop'));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('turns finished work off without asking for permission', async () => {
    const requestPermission = stubNotification('default');
    renderNotifications();

    fireEvent.click(screen.getByRole('combobox', { name: 'Finished work' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Off' }));

    expect(preferences.setFinishedWork).toHaveBeenCalledWith('off');
    expect(requestPermission).not.toHaveBeenCalled();
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

    expect(await screen.findByText('Blocked in browser settings')).toBeVisible();
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
