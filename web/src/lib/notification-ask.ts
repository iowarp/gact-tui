import { create } from 'zustand';
import { requestNotificationPermission } from '@/lib/system-notifications';

const ASKED_KEY = 'clio.notifications.asked';

/**
 * The first-run "Get notified" ask. It still needs the person, so it waits in the bell
 * rather than in a toast over the transcript; the notifier raises it and the bell shows it.
 */
export const useNotificationAsk = create<{ pending: boolean }>(() => ({ pending: false }));

export function notificationAskAnswered(): boolean {
  try {
    return Boolean(window.localStorage.getItem(ASKED_KEY));
  } catch {
    // Storage unavailable: not asked here, and not remembered either.
    return true;
  }
}

export function rememberNotificationAsk() {
  try {
    window.localStorage.setItem(ASKED_KEY, new Date().toISOString());
  } catch {
    // Asked again next launch when storage is unavailable.
  }
}

export function setNotificationAskPending(pending: boolean) {
  useNotificationAsk.setState({ pending });
}

/**
 * Answers the ask. Allow runs the system's own prompt from this click, so the browser
 * allows it and the desktop app shows up in the system's notification settings.
 */
export function answerNotificationAsk(allow: boolean): Promise<string | undefined> {
  rememberNotificationAsk();
  setNotificationAskPending(false);
  return allow ? requestNotificationPermission() : Promise.resolve(undefined);
}
