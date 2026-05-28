import { For, Show, createMemo } from 'solid-js';
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
  const filtered = createMemo(() => {
    const q = props.query.toLowerCase();
    if (!q) return props.items;
    return props.items.filter(
      (it) => it.label.toLowerCase().includes(q) || (it.detail ?? '').toLowerCase().includes(q),
    );
  });

  return (
    <Show when={props.open}>
      <div class="atmention" role="listbox" data-testid="at-mention-picker">
        <div class="atmention__head">
          <span class="eyebrow">@ mention · pick a file, agent, or tool</span>
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
