import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
import { useToast, type ToastTone } from './Toast.js';
import './notification-center.css';

/**
 * Bell-icon button + popover panel that lists the last ~50 toast
 * entries fired this session. Cleared from memory only — survives
 * the chat session but not a reload.
 */
export function NotificationCenter() {
  const toast = useToast();
  const [open, setOpen] = createSignal(false);
  // Tick once per minute so the 'Nm ago' labels stay accurate while
  // the panel sits open.
  const [tick, setTick] = createSignal(0);
  onMount(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    onCleanup(() => clearInterval(id));
  });
  void tick;

  function toggle() {
    const next = !open();
    setOpen(next);
    if (next) toast.markHistorySeen();
  }

  // Close when clicking outside the popover.
  let containerRef: HTMLDivElement | undefined;
  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open()) return;
      const target = e.target as Node;
      if (containerRef && !containerRef.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onDocClick, true);
    onCleanup(() => document.removeEventListener('click', onDocClick, true));
  });

  return (
    <div class="nc" ref={(el) => { containerRef = el; }}>
      <button
        type="button"
        class={'chat__iconbtn ' + (open() ? 'is-active' : '')}
        onClick={toggle}
        title="Notifications"
        data-testid="notification-bell"
        aria-label="Notifications"
        aria-expanded={open()}
      >
        <Icon name="bell" size={14} />
        <Show when={toast.unseenCount() > 0}>
          <span class="nc__badge" data-testid="notification-badge">
            {toast.unseenCount() > 9 ? '9+' : toast.unseenCount()}
          </span>
        </Show>
      </button>
      <Show when={open()}>
        <div class="nc__panel" role="dialog" aria-label="Notifications" data-testid="notification-panel">
          <header class="nc__head">
            <span class="eyebrow">Notifications</span>
            <Show when={toast.history().length > 0}>
              <button
                type="button"
                class="nc__clear"
                onClick={() => toast.clearHistory()}
                data-testid="notification-clear"
              >
                Clear all
              </button>
            </Show>
          </header>
          <ul class="nc__list">
            <Show
              when={toast.history().length > 0}
              fallback={
                <li class="nc__empty" data-testid="notification-empty">
                  <Icon name="bell" size={16} />
                  <span>Nothing here yet — toasts will pile up as CLIO works.</span>
                </li>
              }
            >
              <For each={toast.history()}>
                {(entry) => (
                  <li
                    class={'nc__item nc__item--' + entry.tone}
                    data-testid={`notification-item-${entry.id}`}
                  >
                    <span class="nc__icon">
                      <Icon name={iconFor(entry.tone)} size={12} />
                    </span>
                    <div class="nc__body">
                      <div class="nc__title">{entry.title}</div>
                      <Show when={entry.body}>
                        <div class="nc__detail">{entry.body}</div>
                      </Show>
                      <div class="nc__time">
                        {(tick(), humanWhen(entry.pushedAt))}
                      </div>
                    </div>
                  </li>
                )}
              </For>
            </Show>
          </ul>
        </div>
      </Show>
    </div>
  );
}

function iconFor(tone: ToastTone): IconName {
  switch (tone) {
    case 'success': return 'check';
    case 'warn':    return 'alert';
    case 'error':   return 'alert';
    case 'info':
    default:        return 'sparkle';
  }
}

function humanWhen(epoch: number): string {
  const delta = Date.now() - epoch;
  if (delta < 60_000) return 'just now';
  const min = Math.round(delta / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
