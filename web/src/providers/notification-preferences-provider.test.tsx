import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NotificationPreferencesProvider,
  useNotificationPreferences,
} from './notification-preferences-provider';

function PreferenceProbe() {
  const {
    attentionSound,
    desktopNotifications,
    finishedWork,
    setAttentionSound,
    setDesktopNotifications,
    setFinishedWork,
  } = useNotificationPreferences();
  return (
    <>
      <output>{`${attentionSound}:${desktopNotifications}:${finishedWork}`}</output>
      <button onClick={() => setAttentionSound('always')} type="button">
        Always
      </button>
      <button onClick={() => setDesktopNotifications(false)} type="button">
        No desktop
      </button>
      <button onClick={() => setFinishedWork('off')} type="button">
        Finished off
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
  it('persists configurable attention sound, desktop notification and finished work choices', async () => {
    const user = userEvent.setup();
    render(
      <NotificationPreferencesProvider>
        <PreferenceProbe />
      </NotificationPreferencesProvider>,
    );

    expect(screen.getByText('background:true:desktop')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Always' }));
    await user.click(screen.getByRole('button', { name: 'No desktop' }));
    await user.click(screen.getByRole('button', { name: 'Finished off' }));

    expect(screen.getByText('always:false:off')).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem('clio.notifications.v2') ?? '{}')).toEqual({
      attentionSound: 'always',
      desktopNotifications: false,
      finishedWork: 'off',
    });
  });

  it('reads an unknown stored finished work choice as the desktop default', () => {
    window.localStorage.setItem(
      'clio.notifications.v2',
      JSON.stringify({
        attentionSound: 'always',
        desktopNotifications: false,
        finishedWork: 'loud',
      }),
    );
    render(
      <NotificationPreferencesProvider>
        <PreferenceProbe />
      </NotificationPreferencesProvider>,
    );

    expect(screen.getByText('always:false:desktop')).toBeVisible();
  });

  it('turns notifications on for a person who never chose, keeping an earlier choice', () => {
    // Version 1 wrote its all-off defaults on every first run.
    window.localStorage.setItem(
      'clio.notifications.v1',
      JSON.stringify({ attentionSound: 'off', desktopNotifications: false, finishedWork: 'bell' }),
    );
    render(
      <NotificationPreferencesProvider>
        <PreferenceProbe />
      </NotificationPreferencesProvider>,
    );
    expect(screen.getByText('background:true:desktop')).toBeVisible();
    cleanup();

    window.localStorage.clear();
    window.localStorage.setItem(
      'clio.notifications.v1',
      JSON.stringify({
        attentionSound: 'always',
        desktopNotifications: false,
        finishedWork: 'bell',
      }),
    );
    render(
      <NotificationPreferencesProvider>
        <PreferenceProbe />
      </NotificationPreferencesProvider>,
    );
    expect(screen.getByText('always:false:bell')).toBeVisible();
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
