/**
 * UI component: Notification Center Bell. Exports `NotificationCenterBell`.
 */
import { Show } from 'solid-js';
import { Icon } from './Icon.js';

interface NotificationCenterBellProps {
  open: boolean;
  unseenCount: number;
  onToggle: () => void;
}

export function NotificationCenterBell(props: NotificationCenterBellProps) {
  return (
    <button
      type="button"
      class={'chat__iconbtn ' + (props.open ? 'is-active' : '')}
      onClick={props.onToggle}
      title="Notifications"
      data-testid="notification-bell"
      aria-label="Notifications"
      aria-expanded={props.open}
    >
      <Icon name="bell" size={14} />
      <Show when={props.unseenCount > 0}>
        <span class="nc__badge" data-testid="notification-badge">
          {props.unseenCount > 9 ? '9+' : props.unseenCount}
        </span>
      </Show>
    </button>
  );
}
