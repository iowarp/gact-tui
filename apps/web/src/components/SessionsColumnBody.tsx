/**
 * UI component: Sessions Column Body. Renders `SessionsColumnBody` from `SessionsColumnBodyProps`.
 */
import { For, Show } from 'solid-js';
import { brand } from '@brand';
import { Icon } from './Icon.js';
import { SessionListItem } from './SessionListItem.js';
import type { SessionRow } from './SessionsColumnModel.js';

export interface SessionsColumnBodyProps {
  rows: SessionRow[];
  filteredRows: SessionRow[];
  loading: boolean;
  activeId: string;
  workspaceDisplay: (workspaceId: string | undefined) => string | undefined;
  onSelect: (id: string) => void;
  onRenameSession?: (id: string, nextTitle: string) => void | Promise<void>;
  onDeleteSession?: (id: string) => void | Promise<void>;
  onExportSession?: (id: string) => void | Promise<void>;
  onShareSession?: (id: string) => void | Promise<void>;
  onForkSession?: (id: string) => void | Promise<void>;
  onTogglePin?: (id: string) => void;
}

export function SessionsColumnBody(props: SessionsColumnBodyProps) {
  return (
    <Show
      when={props.filteredRows.length > 0}
      fallback={
        <Show when={props.loading} fallback={<SessionsColumnEmpty rows={props.rows} />}>
          <SessionsColumnSkeleton />
        </Show>
      }
    >
      <ul class="sx__list">
        <For each={props.filteredRows}>
          {(row, i) => (
            <>
              <Show
                when={
                  i() > 0 &&
                  props.filteredRows[i() - 1]?.pinned === true &&
                  row.pinned !== true
                }
              >
                <li class="sx__divider" aria-hidden />
              </Show>
              <SessionListItem
                row={row}
                workspaceLabel={props.workspaceDisplay(row.workspace)}
                active={row.id === props.activeId}
                onSelect={() => props.onSelect(row.id)}
                onRename={
                  props.onRenameSession
                    ? (nextTitle) => props.onRenameSession!(row.id, nextTitle)
                    : undefined
                }
                onDelete={props.onDeleteSession ? () => props.onDeleteSession!(row.id) : undefined}
                onExport={props.onExportSession ? () => props.onExportSession!(row.id) : undefined}
                onShare={props.onShareSession ? () => props.onShareSession!(row.id) : undefined}
                onFork={props.onForkSession ? () => props.onForkSession!(row.id) : undefined}
                onTogglePin={props.onTogglePin ? () => props.onTogglePin!(row.id) : undefined}
              />
            </>
          )}
        </For>
      </ul>
    </Show>
  );
}

function SessionsColumnEmpty(props: { rows: SessionRow[] }) {
  return (
    <div
      class="sx__empty"
      data-testid={props.rows.length === 0 ? 'sidebar-empty' : 'sessions-empty'}
    >
      <div class="sx__empty-icon">
        <Icon name="sparkle" size={28} />
      </div>
      <p class="sx__empty-title">{props.rows.length === 0 ? 'No sessions yet' : 'No matches'}</p>
      <p class="sx__empty-body">
        {props.rows.length === 0
          ? `Start a conversation — ${brand.name} is ready.`
          : 'Try a different search.'}
      </p>
    </div>
  );
}

function SessionsColumnSkeleton() {
  return (
    <ul class="sx__list" data-testid="sessions-skeleton" aria-hidden="true">
      <For each={[0, 1, 2, 3, 4]}>
        {() => (
          <li class="sx__skeleton-row">
            <div class="skeleton sx__skeleton-title" />
            <div class="skeleton sx__skeleton-meta" />
          </li>
        )}
      </For>
    </ul>
  );
}
