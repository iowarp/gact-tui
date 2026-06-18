import { Show } from 'solid-js';
import { brand } from '@brand';
import { Icon, type IconName } from './Icon.js';
import { BrandMark } from './BrandMark.js';
import { createPersistedBoolean } from '../persisted.js';
import './left-rail.css';

export type RailRoute =
  | 'sessions'
  | 'workspaces'
  | 'agents'
  | 'tools'
  | 'prompts'
  | 'mcp'
  | 'memory'
  | 'metrics'
  | 'settings'
  | 'plugins'
  | 'doctor';

/**
 * A rail item is either a route (selects a destination via `onSelect`) or
 * an action (fires a one-shot callback — e.g. open the catalog overlay).
 * Actions never become `is-active`.
 */
export interface RailEntry {
  id: RailRoute;
  label: string;
  icon: IconName;
  badge?: string | number;
  /** Subset of CapabilityFlags that must be true for this entry to render. */
  requires?: string[];
}

export interface LeftRailProps {
  active: RailRoute;
  caps?: Record<string, boolean | undefined>;
  onSelect: (id: RailRoute) => void;
  onOpenPalette: () => void;
  /** Legacy hook retained for callers while catalog moves out of the primary rail. */
  onOpenCatalog?: () => void;
}

/**
 * Primary shell navigation. The persistent left viewport is intentionally
 * small: sessions own the shell, Settings owns configuration/diagnostics.
 */
const PRIMARY_ENTRY: RailEntry = { id: 'sessions', label: 'Sessions', icon: 'sessions' };

export function LeftRail(props: LeftRailProps) {
  // Persisted expand/collapse. Default collapsed so the conversation owns the
  // first viewport; labels remain one click away and are exposed as titles /
  // aria labels for the icon rail.
  const [expanded, setExpanded] = createPersistedBoolean('clio.rail-expanded.v1', false);

  return (
    <nav
      class={'rail ' + (expanded() ? 'rail--expanded' : 'rail--collapsed')}
      data-testid="left-rail"
      data-expanded={expanded() ? 'true' : 'false'}
      aria-label="Primary"
    >
      <div class="rail__brand">
        <BrandMark class="rail__wordmark" />
        <Show when={expanded()}>
          <span class="rail__wordmark-text">{brand.wordmark}</span>
        </Show>
      </div>

      <button
        type="button"
        class="rail__btn rail__btn--palette"
        data-testid="rail-palette"
        title="Command palette (Ctrl + K)"
        aria-label="Open command palette"
        onClick={props.onOpenPalette}
      >
        <Icon name="palette" />
        <Show when={expanded()}>
          <span class="rail__label">Command palette</span>
          <kbd class="rail__kbd">⌘K</kbd>
        </Show>
      </button>

      <div class="rail__divider" />

      <div class="rail__groups">
        <div class="rail__group" role="group" aria-label="Chat">
          <Show when={expanded()}>
            <div class="rail__group-heading" aria-hidden="true">
              Chat
            </div>
          </Show>
          <ul class="rail__list">
            <li>
              <button
                type="button"
                class={
                  'rail__btn ' + (props.active === PRIMARY_ENTRY.id ? 'is-active' : '')
                }
                title={PRIMARY_ENTRY.label}
                aria-label={PRIMARY_ENTRY.label}
                aria-current={props.active === PRIMARY_ENTRY.id ? 'page' : undefined}
                data-testid={`rail-${PRIMARY_ENTRY.id}`}
                onClick={() => props.onSelect(PRIMARY_ENTRY.id)}
              >
                <Icon name={PRIMARY_ENTRY.icon} />
                <Show when={expanded()}>
                  <span class="rail__label">{PRIMARY_ENTRY.label}</span>
                </Show>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div class="rail__spacer" />

      <button
        type="button"
        class={'rail__btn ' + (props.active === 'settings' ? 'is-active' : '')}
        title="Settings"
        aria-label="Settings"
        aria-current={props.active === 'settings' ? 'page' : undefined}
        data-testid="rail-settings"
        onClick={() => props.onSelect('settings')}
      >
        <Icon name="settings" />
        <Show when={expanded()}>
          <span class="rail__label">Settings</span>
        </Show>
      </button>

      <button
        type="button"
        class="rail__btn rail__btn--toggle"
        data-testid="rail-toggle"
        title={expanded() ? 'Collapse menu' : 'Expand menu'}
        aria-label={expanded() ? 'Collapse menu' : 'Expand menu'}
        aria-expanded={expanded() ? 'true' : 'false'}
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon name="menu" />
        <Show when={expanded()}>
          <span class="rail__label">Collapse</span>
        </Show>
      </button>
    </nav>
  );
}
