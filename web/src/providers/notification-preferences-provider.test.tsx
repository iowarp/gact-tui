import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NotificationPreferencesProvider,
  useNotificationPreferences,
} from './notification-preferences-provider';

function PreferenceProbe() {
  const { attentionSound, desktopNotifications, setAttentionSound, setDesktopNotifications } =
    useNotificationPreferences();
  return (
    <>
      <output>{`${attentionSound}:${desktopNotifications}`}</output>
      <button onClick={() => setAttentionSound('always')} type="button">
        Always
      </button>
      <button onClick={() => setDesktopNotifications(true)} type="button">
        Desktop
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => window.localStorage.clear());

describe('notification preferences', () => {
  it('persists configurable attention sound and desktop notification choices', async () => {
    const user = userEvent.setup();
    render(
      <NotificationPreferencesProvider>
        <PreferenceProbe />
      </NotificationPreferencesProvider>,
    );

    expect(screen.getByText('background:false')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Always' }));
    await user.click(screen.getByRole('button', { name: 'Desktop' }));

    expect(screen.getByText('always:true')).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem('clio.notifications.v1') ?? '{}')).toEqual({
      attentionSound: 'always',
      desktopNotifications: true,
    });
  });
});
