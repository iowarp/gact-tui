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
}

interface ToastRecord extends Required<Omit<ToastInput, 'body' | 'icon' | 'action'>> {
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

  function dismiss(id: number) {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }

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
    setToasts((cur) => {
      const next = [...cur, rec];
      if (next.length <= MAX_VISIBLE) return next;
      // Evict the oldest non-pinned entry to make room.
      const evictIdx = next.findIndex((t) => t.duration > 0);
      if (evictIdx === -1) return next.slice(-MAX_VISIBLE);
      return [...next.slice(0, evictIdx), ...next.slice(evictIdx + 1)];
    });
    if (rec.duration > 0) {
      const t = window.setTimeout(() => dismiss(id), rec.duration);
      onCleanup(() => window.clearTimeout(t));
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
