/**
 * UI component: Slash Palette.
 */
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
} from 'solid-js';
import { brand } from '@brand';
import { registerWindowKeydown } from '../domListeners.js';
import { fuzzyRank } from '../fuzzy.js';
import { trapFocusRef } from '../focus-trap.js';
import './slash-palette.css';

export interface SlashCommand {
  id: string;
  trigger: string;
  description: string;
  category?: string;
}

export interface SlashPaletteProps {
  open: boolean;
  query: string;
  commands: SlashCommand[];
  onQueryChange: (q: string) => void;
  onPick: (cmd: SlashCommand) => void;
  onClose: () => void;
}

const DEFAULT_COMMANDS: SlashCommand[] = [
  { id: 'help', trigger: '/help', description: `Show what ${brand.name} can do`, category: 'Help' },
  { id: 'doctor', trigger: '/doctor', description: 'Inspect backend health + integrations', category: 'Diagnostics' },
  { id: 'agents', trigger: '/agents', description: 'List registered experts', category: 'Catalog' },
  { id: 'tools', trigger: '/tools', description: 'Browse MCP tool gateway', category: 'Catalog' },
  { id: 'inspect-hdf5', trigger: '/inspect hdf5', description: 'Inspect an HDF5 file', category: 'Advanced' },
  { id: 'inspect-parquet', trigger: '/inspect parquet', description: 'Inspect a Parquet file', category: 'Advanced' },
  { id: 'settings', trigger: '/settings', description: 'Open settings', category: 'Settings' },
];

interface CommandGroup {
  category: string;
  testid: string;
  items: Array<{ command: SlashCommand; index: number }>;
}

/**
 * Cmd+K / Ctrl+K palette (Wave 4).
 *
 * Renders an overlay-anchored modal listing slash commands; arrow keys
 * move the highlight, Enter picks, Esc closes. The commands list is
 * provided by the caller so the same modal can render dynamic suggestions
 * (e.g. from `/v1/agents` once Wave 2 capability gating is live).
 */
export function SlashPalette(props: SlashPaletteProps) {
  const [highlight, setHighlight] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  const filtered = createMemo(() => {
    const q = props.query.replace(/^\//, '').toLowerCase();
    if (!q) return props.commands;
    // Fuzzy subsequence ranking (shared util); trigger matches outrank
    // description-only matches so "dctr" surfaces "/doctor" first.
    return fuzzyRank(
      props.commands,
      q,
      (c) => c.trigger,
      (c) => c.description,
    );
  });

  const groups = createMemo<CommandGroup[]>(() => {
    const byCategory = new Map<string, CommandGroup>();
    filtered().forEach((command, index) => {
      const category = categoryLabel(command.category);
      let group = byCategory.get(category);
      if (!group) {
        group = { category, testid: categoryTestId(category), items: [] };
        byCategory.set(category, group);
      }
      group.items.push({ command, index });
    });
    return [...byCategory.values()];
  });

  // Refocus the input each time the palette opens, after the Show
  // branch has actually mounted the element.
  createEffect(() => {
    if (props.open) {
      queueMicrotask(() => inputRef?.focus());
    }
  });

  const onKey = (e: KeyboardEvent) => {
    if (!props.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
      return;
    }
    const list = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(list.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = list[highlight()];
      if (pick) props.onPick(pick);
    }
  };
  registerWindowKeydown(onKey, true);

  return (
    <Show when={props.open}>
      <div class="slash-palette__backdrop" onClick={props.onClose} />
      <div
        class="slash-palette"
        role="dialog"
        aria-modal="true"
        ref={trapFocusRef}
        data-testid="slash-palette"
      >
        <header class="slash-palette__head">
          <span class="eyebrow">cmd + k · command palette</span>
        </header>
        <input
          ref={inputRef}
          type="text"
          class="slash-palette__input"
          placeholder="Type a command or `/`…"
          value={props.query}
          onInput={(e) => {
            props.onQueryChange(e.currentTarget.value);
            setHighlight(0);
          }}
          data-testid="slash-palette-input"
        />
        <ul class="slash-palette__list" role="listbox">
          <For each={groups()}>
            {(group) => (
              <>
                <li class="slash-palette__group" data-testid={`slash-palette-group-${group.testid}`}>
                  {group.category}
                </li>
                <For each={group.items}>
                  {(entry) => (
                    <li
                      role="option"
                      aria-selected={entry.index === highlight()}
                      class={
                        'slash-palette__item ' +
                        (entry.index === highlight() ? 'is-active' : '')
                      }
                      onMouseEnter={() => setHighlight(entry.index)}
                      onClick={() => props.onPick(entry.command)}
                      data-testid={`slash-palette-item-${entry.command.id}`}
                    >
                      <span class="slash-palette__trigger">{entry.command.trigger}</span>
                      <span class="slash-palette__desc">{entry.command.description}</span>
                      <span
                        class={`slash-palette__cat slash-palette__cat--${(entry.command.category ?? 'meta').toLowerCase()}`}
                      >
                        {categoryLabel(entry.command.category)}
                      </span>
                    </li>
                  )}
                </For>
              </>
            )}
          </For>
          <Show when={filtered().length === 0}>
            <li class="slash-palette__empty">No matching commands.</li>
          </Show>
        </ul>
        <footer class="slash-palette__foot">
          <span class="chip">↑ ↓ navigate</span>
          <span class="chip">↵ run</span>
          <span class="chip">esc close</span>
        </footer>
      </div>
    </Show>
  );
}

export { DEFAULT_COMMANDS };

function categoryLabel(category: string | undefined): string {
  switch ((category ?? '').toLowerCase()) {
    case 'recent':
      return 'Recent';
    case 'jump':
    case 'navigation':
      return 'Navigation';
    case 'settings':
      return 'Settings';
    case 'perm':
      return 'Permissions';
    case 'view':
      return 'View';
    case 'data':
    case 'advanced':
      return 'Advanced';
    case 'discovery':
    case 'catalog':
      return 'Catalog';
    case 'meta':
    case 'help':
      return 'Help';
    case 'action':
      return 'Actions';
    default:
      return category || 'Commands';
  }
}

function categoryTestId(category: string): string {
  return category.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'Commands';
}
