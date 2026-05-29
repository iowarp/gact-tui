import { For, Show, onCleanup, onMount } from 'solid-js';
import { Icon } from './Icon.js';
import './keybind-cheatsheet.css';

export interface KeybindCheatsheetProps {
  open: boolean;
  onClose: () => void;
}

interface Group {
  title: string;
  items: { combo: string[]; description: string }[];
}

const PLATFORM_MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

const GROUPS: Group[] = [
  {
    title: 'Navigation',
    items: [
      { combo: [PLATFORM_MOD, 'K'], description: 'Open the command palette' },
      { combo: [PLATFORM_MOD, 'Shift', 'K'], description: 'Open the catalog browser (agents · tools · MCP · prompts · workspaces)' },
      { combo: [PLATFORM_MOD, 'L'], description: 'Open a shared CLIO session by token (read-only)' },
      { combo: [PLATFORM_MOD, 'Shift', 'D'], description: 'Walk away from the active session (Ctrl+K re-attaches)' },
      { combo: [PLATFORM_MOD, 'R'], description: 'Refresh the sessions list (instead of reloading the browser)' },
      { combo: [PLATFORM_MOD, 'Shift', '↑'], description: 'Previous session' },
      { combo: [PLATFORM_MOD, 'Shift', '↓'], description: 'Next session' },
      { combo: [PLATFORM_MOD, 'N'], description: 'New session' },
      { combo: [PLATFORM_MOD, ','], description: 'Open Settings' },
    ],
  },
  {
    title: 'Composer',
    items: [
      { combo: ['Enter'], description: 'Send message' },
      { combo: [PLATFORM_MOD, 'Enter'], description: 'Force-send (even with Shift held)' },
      { combo: ['Shift', 'Enter'], description: 'Insert newline' },
      { combo: ['/'], description: 'Open the slash command palette' },
      { combo: ['@'], description: 'Insert an at-mention' },
      { combo: [PLATFORM_MOD, 'G'], description: 'Open the compose modal — fullscreen draft authoring' },
      { combo: [PLATFORM_MOD, 'S'], description: 'Export current session as JSON' },
      { combo: [PLATFORM_MOD, 'Shift', 'S'], description: 'Fork the current session' },
    ],
  },
  {
    title: 'View',
    items: [
      { combo: [PLATFORM_MOD, 'F'], description: 'Find in current transcript (client-side)' },
      { combo: [PLATFORM_MOD, 'Shift', 'F'], description: 'Backend search across the whole session' },
      { combo: [PLATFORM_MOD, 'I'], description: 'Toggle the inspector drawer' },
      { combo: [PLATFORM_MOD, 'B'], description: 'Toggle the sessions column' },
      { combo: [PLATFORM_MOD, 'O'], description: 'Cycle transcript density' },
      { combo: [PLATFORM_MOD, '/'], description: 'Open this cheatsheet' },
      { combo: ['Esc'], description: 'Close overlay / palette · stop streaming turn' },
    ],
  },
];

export function KeybindCheatsheet(props: KeybindCheatsheetProps) {
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => window.removeEventListener('keydown', onKey, true));
  });

  return (
    <Show when={props.open}>
      <div class="kb__backdrop" onClick={props.onClose} />
      <div class="kb" role="dialog" aria-modal="true" data-testid="keybind-cheatsheet">
        <header class="kb__head">
          <span class="eyebrow">keyboard shortcuts</span>
          <button
            type="button"
            class="kb__close"
            onClick={props.onClose}
            aria-label="Close cheatsheet"
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        <div class="kb__body">
          <For each={GROUPS}>
            {(group) => (
              <section class="kb__group">
                <h3 class="kb__group-title">{group.title}</h3>
                <ul class="kb__list">
                  <For each={group.items}>
                    {(item) => (
                      <li class="kb__row">
                        <span class="kb__combo">
                          <For each={item.combo}>
                            {(key, i) => (
                              <>
                                <Show when={i() > 0}>
                                  <span class="kb__sep">+</span>
                                </Show>
                                <kbd class="kb__key">{key}</kbd>
                              </>
                            )}
                          </For>
                        </span>
                        <span class="kb__desc">{item.description}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
        <footer class="kb__foot">
          <span class="chip">Press {PLATFORM_MOD} + / again or Esc to dismiss</span>
        </footer>
      </div>
    </Show>
  );
}
