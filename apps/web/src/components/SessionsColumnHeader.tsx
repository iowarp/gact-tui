/**
 * UI component: Sessions Column Header. Renders `SessionsColumnHeader` from `SessionsColumnHeaderProps`.
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import { Icon } from './Icon.js';
import {
  readSessionImportBlob,
  shouldShowRunningOnlyFilter,
  type SessionRow,
  type WorkspaceOption,
} from './SessionsColumnModel.js';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.js';

export interface SessionsColumnHeaderProps {
  rows: SessionRow[];
  query: Accessor<string>;
  setQuery: Setter<string>;
  runningOnly: Accessor<boolean>;
  setRunningOnly: Setter<boolean>;
  archiveView: Accessor<boolean>;
  setArchiveView: Setter<boolean>;
  connectionLabel?: string;
  connectionTone?: 'ok' | 'warn' | 'err' | 'idle';
  workspaces?: WorkspaceOption[];
  selectedWorkspaceId?: string;
  onPickWorkspace?: (id: string) => void;
  onNewSession?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onImportSession?: (blob: Record<string, unknown>) => void | Promise<void>;
  archiveEnabled: boolean;
}

export function SessionsColumnHeader(props: SessionsColumnHeaderProps) {
  return (
    <header class="sx__head">
      <Show when={props.workspaces && props.workspaces.length > 0}>
        <WorkspaceSwitcher
          workspaces={props.workspaces!}
          selectedId={props.selectedWorkspaceId ?? '__all'}
          onPick={(id) => props.onPickWorkspace?.(id)}
        />
      </Show>
      <div class="sx__title-row">
        <h2 class="sx__title">Sessions</h2>
        <div class="sx__title-actions">
          <Show when={props.onRefresh}>
            <button
              type="button"
              class="sx__title-refresh"
              onClick={() => void props.onRefresh?.()}
              title="Refresh sessions"
              aria-label="Refresh sessions"
              data-testid="sessions-refresh"
            >
              <Icon name="regenerate" size={12} />
            </button>
          </Show>
          <Show when={props.connectionLabel}>
            <span class={'sx__conn sx__conn--' + (props.connectionTone ?? 'idle')}>
              <span class="sx__conn-dot" />
              {props.connectionLabel}
            </span>
          </Show>
        </div>
      </div>
      <div class="sx__search">
        <Icon name="search" size={14} class="sx__search-icon" />
        <input
          type="text"
          class="sx__search-input"
          placeholder="Search sessions…"
          value={props.query()}
          onInput={(e) => props.setQuery(e.currentTarget.value)}
          data-testid="sessions-search"
        />
      </div>
      <div class="sx__new-row">
        <button
          type="button"
          class="sx__new"
          disabled={!props.onNewSession}
          onClick={() => void props.onNewSession?.()}
          data-testid="sessions-new"
        >
          <Icon name="plus" size={14} />
          <span>New</span>
        </button>
        <Show when={props.onImportSession}>
          <button
            type="button"
            class="sx__new sx__new--icon"
            title="Import session from JSON file"
            aria-label="Import session"
            data-testid="sessions-import"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/json,.json';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const blob = await readSessionImportBlob(file);
                  await props.onImportSession?.(blob);
                } catch (e) {
                  alert('Import failed: ' + (e instanceof Error ? e.message : String(e)));
                }
              };
              input.click();
            }}
          >
            <Icon name="arrow-up-right" size={14} />
          </button>
        </Show>
      </div>
      <div class="sx__filters">
        <Show when={shouldShowRunningOnlyFilter(props.rows, props.archiveView())}>
          <label class="sx__running-toggle" data-testid="sessions-running-only">
            <input
              type="checkbox"
              checked={props.runningOnly()}
              onChange={(e) => props.setRunningOnly(e.currentTarget.checked)}
            />
            <span>Only show running</span>
          </label>
        </Show>
        <Show when={props.archiveEnabled}>
          <button
            type="button"
            class={'sx__archive-toggle ' + (props.archiveView() ? 'is-active' : '')}
            onClick={() => props.setArchiveView((v) => !v)}
            data-testid="sessions-archive-toggle"
          >
            <Show when={props.archiveView()} fallback={<Icon name="sessions" size={11} />}>
              <Icon name="close" size={11} />
            </Show>
            <span>{props.archiveView() ? 'Back to live' : 'View archive'}</span>
          </button>
        </Show>
      </div>
    </header>
  );
}
