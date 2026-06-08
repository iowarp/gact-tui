import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { brand } from '@brand';
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
  { id: 'help', trigger: '/help', description: `Show what ${brand.name} can do`, category: 'meta' },
  { id: 'doctor', trigger: '/doctor', description: 'Inspect backend health + integrations', category: 'meta' },
  { id: 'agents', trigger: '/agents', description: 'List registered experts', category: 'discovery' },
  { id: 'tools', trigger: '/tools', description: 'Browse MCP tool gateway', category: 'discovery' },
  { id: 'inspect-hdf5', trigger: '/inspect hdf5', description: 'Inspect an HDF5 file', category: 'data' },
  { id: 'inspect-parquet', trigger: '/inspect parquet', description: 'Inspect a Parquet file', category: 'data' },
  { id: 'sessions', trigger: '/sessions', description: 'List recent sessions', category: 'navigation' },
  { id: 'settings', trigger: '/settings', description: 'Open settings', category: 'meta' },
];

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
  window.addEventListener('keydown', onKey, true);
  onCleanup(() => window.removeEventListener('keydown', onKey, true));

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
          <For each={filtered()}>
            {(cmd, i) => (
              <li
                role="option"
                aria-selected={i() === highlight()}
                class={
                  'slash-palette__item ' +
                  (i() === highlight() ? 'is-active' : '')
                }
                onMouseEnter={() => setHighlight(i())}
                onClick={() => props.onPick(cmd)}
                data-testid={`slash-palette-item-${cmd.id}`}
              >
                <span class="slash-palette__trigger">{cmd.trigger}</span>
                <span class="slash-palette__desc">{cmd.description}</span>
                <Show when={cmd.category}>
                  <span class={`slash-palette__cat slash-palette__cat--${cmd.category}`}>
                    {cmd.category}
                  </span>
                </Show>
              </li>
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
