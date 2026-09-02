import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('writes localStorage once per change, not twice under StrictMode updater double-invocation', async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <StrictMode>
        <NotificationPreferencesProvider>
          <PreferenceProbe />
        </NotificationPreferencesProvider>
      </StrictMode>,
    );
    setItemSpy.mockClear();

    await user.click(screen.getByRole('button', { name: 'Always' }));

    // A side effect inside the setState updater runs twice in Strict Mode
    // (React invokes it once to verify purity), so an updater that writes
    // storage itself double-writes for one logical preference change.
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    setItemSpy.mockRestore();
  });
});
