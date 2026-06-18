import {
  createSignal,
  For,
  onCleanup,
  Show,
  type JSX,
} from 'solid-js';
import { Icon } from './Icon.js';
import './dropdown.css';

export interface DropdownItem<T = unknown> {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  group?: string;
  disabled?: boolean;
  value: T;
}

export interface DropdownProps<T> {
  /** Visual label on the trigger. */
  label: string;
  /** Trigger icon. */
  icon?: 'sparkle' | 'circle' | 'tool' | 'agents' | 'workspaces';
  /** All selectable items; can mix groups via the `group` field. */
  items: DropdownItem<T>[];
  /** Currently-selected id. */
  selectedId?: string;
  /** Optional placeholder when items is empty. */
  emptyHint?: string;
  /** Optional testid for Playwright proofs. */
  testid?: string;
  /** Disabled state. */
  disabled?: boolean;
  onPick: (item: DropdownItem<T>) => void;
}

export function Dropdown<T>(props: DropdownProps<T>) {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  // Close when clicking outside
  const onDocClick = (e: MouseEvent) => {
    if (!open()) return;
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false);
    }
  };
  document.addEventListener('click', onDocClick);
  onCleanup(() => document.removeEventListener('click', onDocClick));

  const grouped = () => {
    const out = new Map<string | undefined, DropdownItem<T>[]>();
    for (const it of props.items) {
      const g = it.group;
      if (!out.has(g)) out.set(g, []);
      out.get(g)!.push(it);
    }
    return Array.from(out.entries());
  };

  return (
    <div ref={containerRef} class="dd" data-testid={props.testid ?? 'dropdown'}>
      <button
        type="button"
        class="dd__trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        data-testid={props.testid ? `${props.testid}-trigger` : undefined}
      >
        <Show when={props.icon}>
          <Icon name={props.icon!} size={10} />
        </Show>
        <span class="dd__trigger-label">{props.label}</span>
        <Icon name="chevron-down" size={10} />
      </button>
      <Show when={open()}>
        <div
          class="dd__menu"
          role="listbox"
          data-testid={props.testid ? `${props.testid}-menu` : undefined}
        >
          <Show
            when={props.items.length > 0}
            fallback={
              <div class="dd__empty">{props.emptyHint ?? 'Nothing to pick'}</div>
            }
          >
            <For each={grouped()}>
              {([group, items]) => (
                <>
                  <Show when={group}>
                    <div class="dd__group-head">{group}</div>
                  </Show>
                  <For each={items}>
                    {(it) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={it.id === props.selectedId}
                        class={
                          'dd__item ' +
                          (it.id === props.selectedId ? 'is-active' : '')
                        }
                        disabled={it.disabled}
                        data-testid={
                          props.testid ? `${props.testid}-item-${it.id}` : undefined
                        }
                        onClick={() => {
                          setOpen(false);
                          props.onPick(it);
                        }}
                      >
                        <div class="dd__item-main">
                          <div class="dd__item-label">{it.label}</div>
                          <Show when={it.description}>
                            <div class="dd__item-desc">{it.description}</div>
                          </Show>
                        </div>
                        <Show when={it.detail}>
                          <span class="dd__item-detail">{it.detail}</span>
                        </Show>
                        <Show when={it.id === props.selectedId}>
                          <Icon name="check" size={12} />
                        </Show>
                      </button>
                    )}
                  </For>
                </>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/* Hook a trigger element child slot in (for cases where you want custom
   visual). Currently unused but exported for future composability. */
export function DropdownTrigger(props: { children: JSX.Element }) {
  return <>{props.children}</>;
}
