/**
 * UI component: At Mention Picker.
 */
import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import type { Client } from '@clio/core';
import { fuzzyRank } from '../fuzzy.js';
import { Icon, type IconName } from './Icon.js';
import './at-mention-picker.css';

export interface MentionItem {
  id: string;
  label: string;
  kind: 'file' | 'dir' | 'symbol' | 'agent';
  detail?: string;
}

export interface AtMentionPickerProps {
  open: boolean;
  query: string;
  items: MentionItem[];
  highlight: number;
  onPick: (item: MentionItem) => void;
  onClose: () => void;
  /**
   * When set, the picker merges live workspace files (from
   * `GET /v1/workspaces/{workspaceId}/files`) under the static
   * agent / tool / dir entries provided by `items`. Result is
   * de-duplicated by id.
   */
  client?: Client;
  workspaceId?: string;
}

const DEFAULT_ITEMS: MentionItem[] = [
  { id: 'apps/web/src/App.tsx', label: 'apps/web/src/App.tsx', kind: 'file' },
  { id: 'apps/web/src/live.ts', label: 'apps/web/src/live.ts', kind: 'file' },
  { id: 'apps/desktop/src-tauri/src/supervisor.rs', label: 'apps/desktop/src-tauri/src/supervisor.rs', kind: 'file', detail: 'Rust' },
  { id: 'apps/desktop/sidecar-launcher/main.go', label: 'apps/desktop/sidecar-launcher/main.go', kind: 'file', detail: 'Go' },
  { id: 'contract/SPEC.md', label: 'contract/SPEC.md', kind: 'file', detail: 'spec' },
  { id: 'expert/hdf5', label: '@hdf5', kind: 'agent', detail: 'HDF5 inspector expert' },
  { id: 'expert/parquet', label: '@parquet', kind: 'agent', detail: 'Parquet inspector expert' },
  { id: 'tool/fs_read_file', label: 'fs_read_file', kind: 'symbol', detail: 'gateway tool' },
];

/**
 * Inline picker anchored to the composer when the user types `@` (Wave 4).
 *
 * The list of candidates comes from the caller; the default set here
 * powers the visual-proof screenshot. Real wiring against
 * `/v1/agents` + a workspace file index lands as a follow-up.
 */
export function AtMentionPicker(props: AtMentionPickerProps) {
  // Workspace files come back over the network — cache once per
  // workspace id so reopening the picker doesn't hit /files on every
  // keystroke. The list is filtered against props.query in-memory.
  const [filesCache, setFilesCache] = createSignal<Record<string, MentionItem[]>>({});

  const [filesData] = createResource(
    () => {
      if (!props.open || !props.client || !props.workspaceId) return null;
      return { client: props.client, workspaceId: props.workspaceId };
    },
    async (key) => {
      if (!key) return [] as MentionItem[];
      const cached = filesCache()[key.workspaceId];
      if (cached) return cached;
      try {
        const res = await key.client.workspaceFiles(key.workspaceId, { limit: 200 });
        const items: MentionItem[] = res.files.map((f) => ({
          id: 'file:' + f.path,
          label: f.path,
          kind: 'file',
          ...(f.language ? { detail: f.language } : {}),
        }));
        setFilesCache((s) => ({ ...s, [key.workspaceId]: items }));
        return items;
      } catch {
        return [] as MentionItem[];
      }
    },
  );

  const merged = createMemo<MentionItem[]>(() => {
    const fromBackend = filesData() ?? [];
    const seen = new Set(fromBackend.map((i) => i.id));
    const rest = props.items.filter((i) => !seen.has(i.id));
    return [...fromBackend, ...rest];
  });

  const filtered = createMemo(() => {
    const q = props.query.toLowerCase();
    if (!q) return merged();
    // Fuzzy subsequence ranking (shared with the command palette); label
    // matches outrank detail-only matches.
    return fuzzyRank(
      merged(),
      q,
      (it) => it.label,
      (it) => it.detail ?? '',
    );
  });

  return (
    <Show when={props.open}>
      <div class="atmention" role="listbox" data-testid="at-mention-picker">
        <div class="atmention__head">
          <span class="eyebrow">@ reference · pick a file, agent, or tool</span>
        </div>
        <ul class="atmention__list">
          <For each={filtered()}>
            {(it, i) => (
              <li
                role="option"
                aria-selected={i() === props.highlight}
                class={'atmention__item ' + (i() === props.highlight ? 'is-active' : '')}
                onClick={() => props.onPick(it)}
                data-testid={`at-mention-item-${it.id}`}
              >
                <span class={'atmention__kind atmention__kind--' + it.kind}>
                  <Icon name={iconFor(it.kind)} size={12} />
                </span>
                <span class="atmention__label">{it.label}</span>
                <Show when={it.detail}>
                  <span class="atmention__detail">{it.detail}</span>
                </Show>
              </li>
            )}
          </For>
          <Show when={filtered().length === 0}>
            <li class="atmention__empty">No matches for “@{props.query}”</li>
          </Show>
        </ul>
      </div>
    </Show>
  );
}

function iconFor(kind: MentionItem['kind']): IconName {
  switch (kind) {
    case 'file':
      return 'edit';
    case 'dir':
      return 'workspaces';
    case 'agent':
      return 'bot';
    case 'symbol':
      return 'tool';
  }
}

export { DEFAULT_ITEMS };
