/**
 * UI component: Notification Center List. Exports `NotificationCenterList`.
 */
import { For, Show } from 'solid-js';
import { brand } from '@brand';
import { Icon } from './Icon.js';
import type { ToastHistoryEntry } from './Toast.js';
import {
  humanNotificationTime,
  notificationIconFor,
} from './NotificationCenterModel.js';

interface NotificationCenterListProps {
  entries: ToastHistoryEntry[];
  hasHistory: boolean;
  tick: number;
}

export function NotificationCenterList(props: NotificationCenterListProps) {
  return (
    <ul class="nc__list">
      <Show
        when={props.hasHistory}
        fallback={
          <li class="nc__empty" data-testid="notification-empty">
            <Icon name="bell" size={16} />
            <span>Nothing here yet — toasts will pile up as {brand.name} works.</span>
          </li>
        }
      >
        <Show
          when={props.entries.length > 0}
          fallback={
            <li class="nc__empty" data-testid="notification-no-match">
              <Icon name="search" size={16} />
              <span>No notifications match.</span>
            </li>
          }
        >
          <For each={props.entries}>
            {(entry) => (
              <li
                class={'nc__item nc__item--' + entry.tone}
                data-testid={`notification-item-${entry.id}`}
              >
                <span class="nc__icon">
                  <Icon name={notificationIconFor(entry.tone)} size={12} />
                </span>
                <div class="nc__body">
                  <div class="nc__title">{entry.title}</div>
                  <Show when={entry.body}>
                    <div class="nc__detail">{entry.body}</div>
                  </Show>
                  <div class="nc__time">
                    {(props.tick, humanNotificationTime(entry.pushedAt))}
                  </div>
                </div>
              </li>
            )}
          </For>
        </Show>
      </Show>
    </ul>
  );
}
