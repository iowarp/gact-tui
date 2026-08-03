/**
 * Maps backend lifecycle notifications to toast inputs. Exports
 * {@link toastInputForLiveNotification}.
 */
import type { BackendNotification } from '../live.js';
import type { ToastInput, ToastTone } from '../components/Toast.js';

function toneForNotification(level: BackendNotification['level']): ToastTone {
  if (level === 'error') return 'error';
  if (level === 'warning') return 'warn';
  return 'info';
}

export function toastInputForLiveNotification(notification: BackendNotification): ToastInput {
  const tone = toneForNotification(notification.level);
  return {
    tone,
    title: notification.title,
    ...(notification.body ? { body: notification.body } : {}),
    duration: tone === 'error' ? 6000 : 3500,
  };
}
