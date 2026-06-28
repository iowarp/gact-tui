/**
 * UI component: Notification Center. Exports `NotificationCenter`.
 */
import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { registerDocumentEvent } from '../domListeners.js';
import { useToast } from './Toast.js';
import {
  filterNotificationHistory,
  type NotificationToneFilter,
} from './NotificationCenterModel.js';
import { NotificationCenterBell } from './NotificationCenterBell.js';
import { NotificationCenterFilters } from './NotificationCenterFilters.js';
import { NotificationCenterList } from './NotificationCenterList.js';
import './notification-center.css';

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
  const [toneFilter, setToneFilter] = createSignal<NotificationToneFilter>('all');
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
  const filtered = createMemo(() =>
    filterNotificationHistory(toast.history(), toneFilter(), query()),
  );

  // Close when clicking outside the popover.
  let containerRef: HTMLDivElement | undefined;
  registerDocumentEvent('click', (e) => {
    if (!open()) return;
    const target = e.target as Node;
    if (containerRef && !containerRef.contains(target)) {
      setOpen(false);
    }
  }, true);

  return (
    <div class="nc" ref={(el) => { containerRef = el; }}>
      <NotificationCenterBell
        open={open()}
        unseenCount={toast.unseenCount()}
        onToggle={toggle}
      />
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
            <NotificationCenterFilters
              query={query()}
              toneFilter={toneFilter()}
              onQuery={setQuery}
              onToneFilter={setToneFilter}
            />
          </Show>
          <NotificationCenterList
            entries={filtered()}
            hasHistory={toast.history().length > 0}
            tick={tick()}
          />
        </div>
      </Show>
    </div>
  );
}
