import { createContext, For, onCleanup, useContext, createSignal, type ParentComponent } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
import './toast.css';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** Auto-dismiss after this many ms. Defaults to 4500; 0 disables. */
  duration?: number;
  icon?: IconName;
}

interface ToastRecord extends Required<Omit<ToastInput, 'body' | 'icon'>> {
  id: number;
  body?: string;
  icon?: IconName;
}

interface ToastApi {
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  // No-op fallback so tests / fixtures without a provider don't crash.
  return {
    push: () => 0,
    dismiss: () => undefined,
  };
}

export const ToastProvider: ParentComponent = (props) => {
  const [toasts, setToasts] = createSignal<ToastRecord[]>([]);
  let nextId = 1;

  function dismiss(id: number) {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }

  function push(input: ToastInput): number {
    const id = nextId++;
    const rec: ToastRecord = {
      id,
      title: input.title,
      body: input.body,
      icon: input.icon,
      tone: input.tone ?? 'info',
      duration: input.duration ?? 4500,
    };
    setToasts((cur) => [...cur, rec]);
    if (rec.duration > 0) {
      const t = window.setTimeout(() => dismiss(id), rec.duration);
      onCleanup(() => window.clearTimeout(t));
    }
    return id;
  }

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
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
