import { inTauri } from '@/lib/transport/tauri-runtime';

/**
 * System notifications for the desktop app and the browser.
 *
 * The desktop app goes through its own commands, never the `Notification`
 * global: the notification plugin replaces that global with a plain function
 * whose result has no `addEventListener`, so a banner's click listener threw
 * and skipped the attention sound, and it reported every permission as granted
 * without macOS ever asking (#739).
 */

/** As `Notification.permission` names it, plus a host that cannot notify. */
export type SystemNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface SystemNotice {
  /** One banner per id: a later notice with the same id replaces it. */
  id: string;
  title: string;
  body?: string;
  /** The in-app route a click opens. */
  path: string;
  /** Ask for the system's notification sound with the banner. */
  sound: boolean;
}

/** Whether a banner was posted, and whether it carries the system sound. */
export interface SystemNoticeResult {
  shown: boolean;
  sound: boolean;
}

const OPEN_EVENT = 'clio:notification-open';
const NOT_SHOWN: SystemNoticeResult = { shown: false, sound: false };

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

function browserNotifications(): typeof Notification | undefined {
  return typeof Notification === 'undefined' ? undefined : Notification;
}

export async function notificationPermission(): Promise<SystemNotificationPermission> {
  if (inTauri()) {
    try {
      return await invokeDesktop<SystemNotificationPermission>('notification_permission');
    } catch {
      return 'unsupported';
    }
  }
  return browserNotifications()?.permission ?? 'unsupported';
}

/**
 * Asks the system once (call it from a click so the browser allows the prompt);
 * afterwards it reports the answer the person gave.
 */
export async function requestNotificationPermission(): Promise<SystemNotificationPermission> {
  if (inTauri()) {
    try {
      return await invokeDesktop<SystemNotificationPermission>('request_notification_permission');
    } catch {
      return 'unsupported';
    }
  }
  const api = browserNotifications();
  if (!api) return 'unsupported';
  if (api.permission !== 'default') return api.permission;
  try {
    return await api.requestPermission();
  } catch {
    return api.permission;
  }
}

export async function showSystemNotice(notice: SystemNotice): Promise<SystemNoticeResult> {
  if (inTauri()) {
    try {
      return await invokeDesktop<SystemNoticeResult>('show_notification', { notice });
    } catch {
      return NOT_SHOWN;
    }
  }
  const api = browserNotifications();
  if (api?.permission !== 'granted') return NOT_SHOWN;
  try {
    // Silent: the page plays its own chime, under the person's sound setting.
    const notification = new api(notice.title, {
      body: notice.body,
      silent: true,
      tag: notice.id,
    });
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { path: notice.path } }));
      notification.close();
    };
    return { shown: true, sound: false };
  } catch {
    // Some browsers only allow notifications from a service worker.
    return NOT_SHOWN;
  }
}

/** Calls `open` with the route of each clicked banner, including one that started the app. */
export function listenForNotificationOpen(open: (path: string) => void): () => void {
  const accept = (path: unknown) => {
    if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) open(path);
  };
  const onBrowserOpen = (event: Event) => accept((event as CustomEvent<{ path?: unknown }>).detail?.path);
  window.addEventListener(OPEN_EVENT, onBrowserOpen);
  if (!inTauri()) return () => window.removeEventListener(OPEN_EVENT, onBrowserOpen);

  let disposed = false;
  let unlisten: (() => void) | undefined;
  void import('@tauri-apps/api/event')
    .then(async ({ listen }) => {
      const stop = await listen<{ path?: unknown }>(OPEN_EVENT, ({ payload }) => {
        void invokeDesktop('take_notification_open').catch(() => undefined);
        accept(payload?.path);
      });
      if (disposed) stop();
      else unlisten = stop;
      // A banner clicked before this page listened.
      const pending = await invokeDesktop<string | null>('take_notification_open');
      if (!disposed) accept(pending);
    })
    .catch(() => undefined);
  return () => {
    disposed = true;
    unlisten?.();
    window.removeEventListener(OPEN_EVENT, onBrowserOpen);
  };
}

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** The Dock (or installed web app) count of conversations waiting on the person. */
export function setAttentionBadge(count: number): void {
  if (inTauri()) {
    void invokeDesktop('set_attention_badge', { count: Math.max(0, Math.floor(count)) }).catch(
      () => undefined,
    );
    return;
  }
  const badging = navigator as BadgingNavigator;
  const update = count > 0 ? badging.setAppBadge?.(count) : badging.clearAppBadge?.();
  void update?.catch(() => undefined);
}

/** Opens the system's notification settings for this app; false where there is none. */
export async function openNotificationSettings(): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invokeDesktop<boolean>('open_notification_settings');
  } catch {
    return false;
  }
}
