/**
 * Toast helpers for chat: the {@link createChatToasts} factory exposing a
 * `failToast` for surfacing errors with an optional retry.
 */
import type { ToastInput } from '../components/Toast.js';
import { registerWindowEvent } from '../domListeners.js';

type ToastPush = (input: ToastInput) => number;

export type FailToast = (title: string, e: unknown, retry?: () => void) => void;

export function createChatToasts(toastPush: ToastPush): { failToast: FailToast } {
  function failToast(title: string, e: unknown, retry?: () => void) {
    toastPush({
      tone: 'error',
      title,
      body: e instanceof Error ? e.message : String(e),
      ...(retry ? { action: { label: 'Retry', onClick: retry } } : {}),
    });
  }

  // ChatLayout sits below the Toast context. This bridge lets deep layout
  // flows surface feedback without threading toast callbacks through every
  // presentational component.
  registerWindowEvent('clio:toast' as keyof WindowEventMap, (e) => {
    const detail = (e as CustomEvent).detail;
    if (detail && typeof detail === 'object') {
      toastPush(detail as ToastInput);
    }
  });

  return { failToast };
}
