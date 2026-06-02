import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
import { useToast, type ToastTone } from './Toast.js';
import { fuzzyRank } from '../fuzzy.js';
import './notification-center.css';

/** Tone filter chips shown above the list (1.0 item 8). */
const TONE_FILTERS: Array<{ key: ToastTone | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'error', label: 'Errors' },
  { key: 'warn', label: 'Warnings' },
  { key: 'success', label: 'Success' },
  { key: 'info', label: 'Info' },
];

/**
 * Bell-icon button + popover panel that lists the last ~50 toast
 * entries fired this session. Cleared from memory only — survives
 * the chat session but not a reload. Searchable + filterable by tone
 * (1.0 item 8).
 */
export function NotificationCenter() {
  const toast = useToast();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [toneFilter, setToneFilter] = createSignal<ToastTone | 'all'>('all');
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
    if (next) {
      toast.markHistorySeen();
    } else {
      // Reset filters when the panel closes so it reopens unfiltered.
      setQuery('');
      setToneFilter('all');
    }
  }

  /** History filtered by tone chip + fuzzy-matched against the query
   * (title outranks body, same matcher as the command palette). */
  const filtered = createMemo(() => {
    let entries = toast.history();
    const tone = toneFilter();
    if (tone !== 'all') entries = entries.filter((e) => e.tone === tone);
    const q = query().trim().toLowerCase();
    if (!q) return entries;
    return fuzzyRank(
      entries,
      q,
      (e) => e.title,
      (e) => e.body ?? '',
    );
  });

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
          <Show when={toast.history().length > 0}>
            <div class="nc__filters">
              <div class="nc__search-wrap">
                <Icon name="search" size={12} />
                <input
                  class="nc__search"
                  type="text"
                  placeholder="Search notifications…"
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  data-testid="notification-search"
                />
              </div>
              <div class="nc__tones" role="group" aria-label="Filter by type">
                <For each={TONE_FILTERS}>
                  {(f) => (
                    <button
                      type="button"
                      class={
                        'nc__tone-chip' +
                        (toneFilter() === f.key ? ' is-active' : '')
                      }
                      onClick={() => setToneFilter(f.key)}
                      data-testid={`notification-tone-${f.key}`}
                      aria-pressed={toneFilter() === f.key}
                    >
                      {f.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
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
              <Show
                when={filtered().length > 0}
                fallback={
                  <li class="nc__empty" data-testid="notification-no-match">
                    <Icon name="search" size={16} />
                    <span>No notifications match.</span>
                  </li>
                }
              >
                <For each={filtered()}>
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
