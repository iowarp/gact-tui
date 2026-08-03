/**
 * UI component: Sessions Column Footer. Renders `SessionsColumnFooter` from `SessionsColumnFooterProps`.
 */
import { Icon } from './Icon.js';

export interface SessionsColumnFooterProps {
  onOpenSettings?: () => void;
}

export function SessionsColumnFooter(props: SessionsColumnFooterProps) {
  return (
    <footer class="sx__foot">
      <button
        type="button"
        class="sx__foot-btn"
        title="Settings"
        data-testid="sessions-settings"
        onClick={() => props.onOpenSettings?.()}
        disabled={!props.onOpenSettings}
      >
        <Icon name="settings" size={14} />
        <span>Settings</span>
      </button>
    </footer>
  );
}
