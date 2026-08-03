import { describe, expect, it } from 'vitest';
import { toastInputForLiveNotification } from '../../src/routes/chatNotificationToasts.js';

describe('toastInputForLiveNotification', () => {
  it('maps error notifications to longer error toasts', () => {
    expect(
      toastInputForLiveNotification({
        level: 'error',
        title: 'Provider failed',
        body: 'rate limited',
      }),
    ).toEqual({
      tone: 'error',
      title: 'Provider failed',
      body: 'rate limited',
      duration: 6000,
    });
  });

  it('maps warning notifications to warning toasts', () => {
    expect(
      toastInputForLiveNotification({
        level: 'warning',
        title: 'Retry requested',
      }),
    ).toEqual({
      tone: 'warn',
      title: 'Retry requested',
      duration: 3500,
    });
  });

  it('maps info notifications to info toasts and omits empty bodies', () => {
    expect(
      toastInputForLiveNotification({
        level: 'info',
        title: 'Model swapped',
        body: '',
      }),
    ).toEqual({
      tone: 'info',
      title: 'Model swapped',
      duration: 3500,
    });
  });
});
