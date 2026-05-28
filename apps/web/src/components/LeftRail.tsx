import { For, Show } from 'solid-js';
import { Icon, type IconName } from './Icon.js';
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
  | 'doctor';

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
}

const ENTRIES: RailEntry[] = [
  { id: 'sessions', label: 'Sessions', icon: 'sessions' },
  { id: 'workspaces', label: 'Workspaces', icon: 'workspaces', requires: ['workspaces'] },
  { id: 'agents', label: 'Agents', icon: 'agents', requires: ['agent_routing'] },
  { id: 'tools', label: 'Tools', icon: 'tools', requires: ['commands'] },
  { id: 'prompts', label: 'Prompts', icon: 'sparkle', requires: ['prompts'] },
  { id: 'mcp', label: 'MCP servers', icon: 'mcp', requires: ['mcp'] },
  { id: 'memory', label: 'Memory', icon: 'memory', requires: ['memory'] },
  { id: 'metrics', label: 'Metrics', icon: 'metrics', requires: ['metrics'] },
  { id: 'doctor', label: 'Doctor', icon: 'doctor', requires: ['integration_health'] },
];

export function LeftRail(props: LeftRailProps) {
  const caps = () => props.caps ?? {};
  const visible = () =>
    ENTRIES.filter(
      (e) => !e.requires || e.requires.every((flag) => caps()[flag]),
    );

  return (
    <nav class="rail" data-testid="left-rail" aria-label="Primary">
      <div class="rail__brand">
        <div class="rail__wordmark">C</div>
      </div>
      <button
        type="button"
        class="rail__btn rail__btn--palette"
        data-testid="rail-palette"
        title="Command palette (Ctrl + K)"
        onClick={props.onOpenPalette}
      >
        <Icon name="palette" label="Open command palette" />
      </button>
      <div class="rail__divider" />
      <ul class="rail__list">
        <For each={visible()}>
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
                <Show when={e.badge != null}>
                  <span class="rail__badge">{e.badge}</span>
                </Show>
              </button>
            </li>
          )}
        </For>
      </ul>
      <div class="rail__spacer" />
      <button
        type="button"
        class={'rail__btn ' + (props.active === 'settings' ? 'is-active' : '')}
        title="Settings"
        aria-label="Settings"
        data-testid="rail-settings"
        onClick={() => props.onSelect('settings')}
      >
        <Icon name="settings" />
      </button>
    </nav>
  );
}
