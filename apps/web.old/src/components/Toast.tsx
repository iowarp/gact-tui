/**
 * UI component: Toast.
 */
import { createContext, onCleanup, useContext, createSignal, type ParentComponent } from 'solid-js';
import { ToastHost } from './ToastHost.js';
import {
  appendToastHistory,
  appendVisibleToast,
  createToastHistoryEntry,
  createToastRecord,
  findDuplicateVisibleToast,
  TOAST_HISTORY_LIMIT,
  type ToastHistoryEntry,
  type ToastInput,
  type ToastRecord,
} from './ToastModel.js';
import './toast.css';

export type { ToastAction, ToastHistoryEntry, ToastInput, ToastTone } from './ToastModel.js';

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

  function push(input: ToastInput): number {
    const id = nextId++;
    const rec = createToastRecord(id, input);
    // Silent entries skip the visible toast stack entirely — they exist
    // only in the bell history (1.0 item 8).
    if (!input.silent) {
      // Coalesce an identical toast that's already on screen: restart its
      // countdown rather than stacking a visual duplicate. The history list
      // below still records every occurrence.
      const dupe = findDuplicateVisibleToast(toasts(), rec);
      if (dupe) {
        scheduleDismiss(dupe.id, dupe.duration);
      } else {
        setToasts((cur) => {
          const result = appendVisibleToast(cur, rec);
          if (result.evictedId !== undefined) clearTimer(result.evictedId);
          return result.toasts;
        });
        scheduleDismiss(id, rec.duration);
      }
    }
    // Mirror into the persistent history list (newest first, capped).
    const histEntry = createToastHistoryEntry(rec);
    setHistory((prev) => appendToastHistory(prev, histEntry, TOAST_HISTORY_LIMIT));
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
      <ToastHost toasts={toasts()} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};
