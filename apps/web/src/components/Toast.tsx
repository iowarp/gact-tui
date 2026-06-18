import { createContext, For, onCleanup, useContext, createSignal, type ParentComponent } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
import './toast.css';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

/** Clickable next-action on a toast — the thing that turns an error
 * notification from a dead-end into a recovery path (W3 Tier-1:
 * "every error offers a next action"). Clicking runs the callback and
 * dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** Auto-dismiss after this many ms. Defaults to 4500; 0 disables. */
  duration?: number;
  icon?: IconName;
  /** Optional action button (e.g. Retry / Open settings / Reconnect now). */
  action?: ToastAction;
  /** Record into the notification-center history WITHOUT showing a
   * visible toast — for ambient events that belong in the bell, not
   * on screen (1.0 item 8). */
  silent?: boolean;
}

interface ToastRecord extends Required<Omit<ToastInput, 'body' | 'icon' | 'action' | 'silent'>> {
  id: number;
  body?: string;
  icon?: IconName;
  action?: ToastAction;
}

export interface ToastHistoryEntry {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  /** Epoch ms when the toast was pushed. */
  pushedAt: number;
}

interface ToastApi {
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
  /** Snapshot of the last ~50 toasts (newest first). */
  history: () => ToastHistoryEntry[];
  /** Clears the history list. */
  clearHistory: () => void;
  /** Number of unseen history entries (resets to 0 on markHistorySeen). */
  unseenCount: () => number;
  markHistorySeen: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  // No-op fallback so tests / fixtures without a provider don't crash.
  return {
    push: () => 0,
    dismiss: () => undefined,
    history: () => [],
    clearHistory: () => undefined,
    unseenCount: () => 0,
    markHistorySeen: () => undefined,
  };
}

export const ToastProvider: ParentComponent = (props) => {
  const [toasts, setToasts] = createSignal<ToastRecord[]>([]);
  const [history, setHistory] = createSignal<ToastHistoryEntry[]>([]);
  const [unseenCount, setUnseenCount] = createSignal(0);
  const HISTORY_LIMIT = 50;
  let nextId = 1;
  // Per-visible-toast auto-dismiss timers, so a coalesced duplicate can
  // restart the existing toast's countdown instead of stacking a copy.
  const timers = new Map<number, number>();
  // Identical visible toasts (same tone+title+body) coalesce onto the
  // existing toast until it is dismissed. This keeps reconnect loops from
  // stacking visually identical recovery prompts.

  function clearTimer(id: number) {
    const t = timers.get(id);
    if (t !== undefined) {
      window.clearTimeout(t);
      timers.delete(id);
    }
  }

  function dismiss(id: number) {
    clearTimer(id);
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }

  function scheduleDismiss(id: number, duration: number) {
    if (duration <= 0) return;
    clearTimer(id);
    const t = window.setTimeout(() => dismiss(id), duration);
    timers.set(id, t);
  }
  onCleanup(() => {
    for (const t of timers.values()) window.clearTimeout(t);
    timers.clear();
  });

  // Cap simultaneously-visible toasts to keep the bottom-right stack
  // from snowballing during a burst of SSE notifications. Oldest
  // entries fall off first; pinned (duration:0) entries are exempted.
  const MAX_VISIBLE = 5;

  function push(input: ToastInput): number {
    const id = nextId++;
    const rec: ToastRecord = {
      id,
      title: input.title,
      body: input.body,
      icon: input.icon,
      tone: input.tone ?? 'info',
      // Toasts with an action linger longer so the user has time to click it.
      duration: input.duration ?? (input.action ? 8000 : 4500),
      action: input.action,
    };
    // Silent entries skip the visible toast stack entirely — they exist
    // only in the bell history (1.0 item 8).
    if (!input.silent) {
      // Coalesce an identical toast that's already on screen: restart its
      // countdown rather than stacking a visual duplicate. The history list
      // below still records every occurrence.
      const dupe = toasts().find(
        (t) => t.tone === rec.tone && t.title === rec.title && t.body === rec.body,
      );
      if (dupe) {
        scheduleDismiss(dupe.id, dupe.duration);
      } else {
        setToasts((cur) => {
          const next = [...cur, rec];
          if (next.length <= MAX_VISIBLE) return next;
          // Evict the oldest non-pinned entry to make room.
          const evictIdx = next.findIndex((t) => t.duration > 0);
          if (evictIdx === -1) return next.slice(-MAX_VISIBLE);
          const [evicted] = next.splice(evictIdx, 1);
          if (evicted) clearTimer(evicted.id);
          return next;
        });
        scheduleDismiss(id, rec.duration);
      }
    }
    // Mirror into the persistent history list (newest first, capped).
    const histEntry: ToastHistoryEntry = {
      id,
      title: rec.title,
      ...(rec.body ? { body: rec.body } : {}),
      tone: rec.tone,
      pushedAt: Date.now(),
    };
    setHistory((prev) => [histEntry, ...prev].slice(0, HISTORY_LIMIT));
    setUnseenCount((n) => n + 1);
    return id;
  }

  return (
    <ToastContext.Provider
      value={{
        push,
        dismiss,
        history,
        clearHistory: () => {
          setHistory([]);
          setUnseenCount(0);
        },
        unseenCount,
        markHistorySeen: () => setUnseenCount(0),
      }}
    >
      {props.children}
      <div class="toast-host" data-testid="toast-host" aria-live="polite">
        <For each={toasts()}>
          {(t) => (
            <div
              class={'toast toast--' + t.tone}
              data-testid={`toast-${t.id}`}
              role="status"
            >
              <div class="toast__icon">
                <Icon name={t.icon ?? defaultIcon(t.tone)} size={14} />
              </div>
              <div class="toast__main">
                <div class="toast__title">{t.title}</div>
                {t.body && <div class="toast__body">{t.body}</div>}
                {t.action && (
                  <button
                    type="button"
                    class="toast__action"
                    data-testid={`toast-action-${t.id}`}
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                class="toast__close"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                <Icon name="close" size={10} />
              </button>
            </div>
          )}
        </For>
      </div>
    </ToastContext.Provider>
  );
};

function defaultIcon(tone: ToastTone): IconName {
  switch (tone) {
    case 'success':
      return 'check';
    case 'warn':
      return 'help';
    case 'error':
      return 'close';
    case 'info':
    default:
      return 'sparkle';
  }
}
