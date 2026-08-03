/**
 * UI component: Notification Center Filters. Exports `NotificationCenterFilters`.
 */
import { For } from 'solid-js';
import { Icon } from './Icon.js';
import {
  TONE_FILTERS,
  type NotificationToneFilter,
} from './NotificationCenterModel.js';

interface NotificationCenterFiltersProps {
  query: string;
  toneFilter: NotificationToneFilter;
  onQuery: (value: string) => void;
  onToneFilter: (value: NotificationToneFilter) => void;
}

export function NotificationCenterFilters(props: NotificationCenterFiltersProps) {
  return (
    <div class="nc__filters">
      <div class="nc__search-wrap">
        <Icon name="search" size={12} />
        <input
          class="nc__search"
          type="text"
          placeholder="Search notifications…"
          value={props.query}
          onInput={(e) => props.onQuery(e.currentTarget.value)}
          data-testid="notification-search"
        />
      </div>
      <div class="nc__tones" role="group" aria-label="Filter by type">
        <For each={TONE_FILTERS}>
          {(f) => (
            <button
              type="button"
              class={'nc__tone-chip' + (props.toneFilter === f.key ? ' is-active' : '')}
              onClick={() => props.onToneFilter(f.key)}
              data-testid={`notification-tone-${f.key}`}
              aria-pressed={props.toneFilter === f.key}
            >
              {f.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
