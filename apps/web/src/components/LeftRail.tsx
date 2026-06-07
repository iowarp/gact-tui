import { For, Show } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
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

/** A logical cluster of destinations, rendered with a (screen-reader) heading. */
interface RailGroup {
  /** Group heading — shown in the expanded rail, used as an aria-label always. */
  heading: string;
  entries: RailEntry[];
}

export interface LeftRailProps {
  active: RailRoute;
  caps?: Record<string, boolean | undefined>;
  onSelect: (id: RailRoute) => void;
  onOpenPalette: () => void;
  /** Open the unified catalog (agents/tools/MCP/prompts) overlay. This is
   * the one management surface that was previously reachable ONLY via
   * Cmd+K / Ctrl+Shift+K — a non-technical user needs a visible door. */
  onOpenCatalog?: () => void;
}

/**
 * Top-level navigation groups. Every destination a non-technical user can
 * reach lives here as an icon + text label — Cmd+K is an accelerator, not
 * the only door (see docs/ref/hermes-agent-desktop.md §1c).
 *
 * Capability gating: an entry renders when it has no `requires`, or when
 * ANY listed capability flag is truthy. Some entries (Doctor) list both the
 * TUI flag (`doctor`) and the Desktop flag (`integration_health`) for
 * cross-client coherence.
 */
const GROUPS: RailGroup[] = [
  {
    heading: 'Chat',
    entries: [{ id: 'sessions', label: 'Sessions', icon: 'sessions' }],
  },
  {
    heading: 'Discover',
    entries: [
      { id: 'workspaces', label: 'Workspaces', icon: 'workspaces', requires: ['workspaces'] },
      { id: 'agents', label: 'Agents', icon: 'agents', requires: ['agent_routing'] },
      { id: 'tools', label: 'Commands', icon: 'tools', requires: ['commands'] },
      { id: 'prompts', label: 'Prompts', icon: 'sparkle', requires: ['prompts'] },
      { id: 'mcp', label: 'MCP servers', icon: 'mcp', requires: ['mcp'] },
      { id: 'memory', label: 'Memory', icon: 'memory', requires: ['memory'] },
    ],
  },
  {
    heading: 'System',
    entries: [
      { id: 'metrics', label: 'Metrics', icon: 'metrics', requires: ['metrics'] },
      { id: 'doctor', label: 'Doctor', icon: 'doctor', requires: ['integration_health', 'doctor'] },
      { id: 'plugins', label: 'Plugins', icon: 'tool' },
    ],
  },
];

export function LeftRail(props: LeftRailProps) {
  const caps = () => props.caps ?? {};
  // Persisted expand/collapse. Default EXPANDED so a first-time, non-technical
  // user sees text labels next to every icon — no mystery-meat. Power users can
  // collapse to a slim icon rail; tooltips keep labels reachable on hover.
  const [expanded, setExpanded] = createPersistedBoolean('clio.rail-expanded.v1', true);

  function visibleEntries(entries: RailEntry[]): RailEntry[] {
    return entries.filter(
      (e) => !e.requires || e.requires.some((flag) => caps()[flag]),
    );
  }

  const groups = () =>
    GROUPS.map((g) => ({ ...g, entries: visibleEntries(g.entries) })).filter(
      (g) => g.entries.length > 0,
    );

  return (
    <nav
      class={'rail ' + (expanded() ? 'rail--expanded' : 'rail--collapsed')}
      data-testid="left-rail"
      data-expanded={expanded() ? 'true' : 'false'}
      aria-label="Primary"
    >
      <div class="rail__brand">
        <div class="rail__wordmark">C</div>
        <Show when={expanded()}>
          <span class="rail__wordmark-text">CLIO</span>
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

      <Show when={props.onOpenCatalog}>
        <button
          type="button"
          class="rail__btn"
          data-testid="rail-catalog"
          title="Browse everything (Ctrl + Shift + K)"
          aria-label="Browse the catalog"
          onClick={() => props.onOpenCatalog?.()}
        >
          <Icon name="catalog" />
          <Show when={expanded()}>
            <span class="rail__label">Browse catalog</span>
          </Show>
        </button>
      </Show>

      <div class="rail__divider" />

      <div class="rail__groups">
        <For each={groups()}>
          {(group) => (
            <div class="rail__group" role="group" aria-label={group.heading}>
              <Show when={expanded()}>
                <div class="rail__group-heading" aria-hidden="true">
                  {group.heading}
                </div>
              </Show>
              <ul class="rail__list">
                <For each={group.entries}>
                  {(e) => (
                    <li>
                      <button
                        type="button"
                        class={'rail__btn ' + (props.active === e.id ? 'is-active' : '')}
                        title={e.label}
                        aria-label={e.label}
                        aria-current={props.active === e.id ? 'page' : undefined}
                        data-testid={`rail-${e.id}`}
                        onClick={() => props.onSelect(e.id)}
                      >
                        <Icon name={e.icon} />
                        <Show when={expanded()}>
                          <span class="rail__label">{e.label}</span>
                        </Show>
                        <Show when={e.badge != null}>
                          <span class="rail__badge">{e.badge}</span>
                        </Show>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
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
