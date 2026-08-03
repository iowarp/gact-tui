/**
 * UI component: Toast Host.
 */
import { For } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
import type { ToastAction, ToastTone } from './Toast.js';

export interface VisibleToast {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  icon?: IconName;
  action?: ToastAction;
  testId?: string;
}

export interface ToastHostProps {
  toasts: readonly VisibleToast[];
  onDismiss: (id: number) => void;
}

export function ToastHost(props: ToastHostProps) {
  return (
    <div class="toast-host" data-testid="toast-host" aria-live="polite">
      <For each={props.toasts}>
        {(toast) => (
          <div
            class={'toast toast--' + toast.tone}
            data-testid={toast.testId ?? `toast-${toast.id}`}
            data-toast-id={toast.id}
            role="status"
          >
            <div class="toast__icon">
              <Icon name={toast.icon ?? defaultIcon(toast.tone)} size={14} />
            </div>
            <div class="toast__main">
              <div class="toast__title">{toast.title}</div>
              {toast.body && <div class="toast__body">{toast.body}</div>}
              {toast.action && (
                <button
                  type="button"
                  class="toast__action"
                  data-testid={`toast-action-${toast.id}`}
                  onClick={() => {
                    toast.action?.onClick();
                    props.onDismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              class="toast__close"
              onClick={() => props.onDismiss(toast.id)}
              aria-label="Dismiss"
            >
              <Icon name="close" size={10} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

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
