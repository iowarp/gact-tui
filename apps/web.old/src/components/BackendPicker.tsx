/**
 * UI component: Backend Picker. Renders `BackendPicker` from `BackendPickerProps`.
 */
import { createSignal, For, Show } from 'solid-js';
import type { BackendEntry } from '@clio/core';
import { useBackendRegistry } from '../registry.js';
import { Icon } from './Icon.js';
import './backend-picker.css';

export interface BackendPickerProps {
  /** Called when the user picks the "add remote" item from the menu. */
  onAddRemote?: () => void;
  /** Called when the user picks the "settings" item from the menu. */
  onOpenSettings?: () => void;
}

/**
 * Composer-footer dropdown listing all registered backends with a
 * status pip. The first entry is normally the bundled local sidecar;
 * additional entries come from /settings/backends/add-remote or the
 * desktop SSH wizard.
 */
export function BackendPicker(props: BackendPickerProps) {
  const reg = useBackendRegistry();
  const [open, setOpen] = createSignal(false);

  const cur = () => reg.current();

  return (
    <div class="bp">
      <button
        type="button"
        class="composer__picker"
        data-testid="backend-picker"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
        aria-haspopup="listbox"
      >
        <Show when={cur()} fallback={<><span class="bp__pip bp__pip--idle" />no backend</>}>
          {(c) => (
            <>
              <span class={'bp__pip ' + pipClass(c())} />
              {c().label}
            </>
          )}
        </Show>
        <Icon name="chevron-down" size={12} class="bp__chev" />
      </button>

      <Show when={open()}>
        <div
          class="bp__menu"
          role="listbox"
          data-testid="backend-picker-menu"
          onMouseLeave={() => setOpen(false)}
        >
          <For each={reg.state().backends}>
            {(b) => (
              <button
                type="button"
                role="option"
                aria-selected={b.id === cur()?.id}
                class={'bp__item ' + (b.id === cur()?.id ? 'bp__item--active' : '')}
                data-testid={`backend-picker-item-${b.id}`}
                onClick={() => {
                  reg.select(b.id);
                  setOpen(false);
                }}
              >
                <span class={'bp__pip ' + pipClass(b)} />
                <span class="bp__label">{b.label}</span>
                <span class="bp__sub">{b.url}</span>
              </button>
            )}
          </For>

          <div class="bp__divider" />
          <button
            type="button"
            class="bp__action"
            data-testid="backend-picker-add"
            onClick={() => {
              setOpen(false);
              props.onAddRemote?.();
            }}
          >
            <Icon name="plus" size={12} />
            <span>Add remote backend</span>
          </button>
          <button
            type="button"
            class="bp__action"
            data-testid="backend-picker-settings"
            onClick={() => {
              setOpen(false);
              props.onOpenSettings?.();
            }}
          >
            <Icon name="settings" size={12} />
            <span>Backends settings</span>
          </button>
        </div>
      </Show>
    </div>
  );
}

function pipClass(b: BackendEntry): string {
  if (b.lastError) return 'bp__pip--err';
  if (b.capabilities) return 'bp__pip--ok';
  return 'bp__pip--warn';
}
