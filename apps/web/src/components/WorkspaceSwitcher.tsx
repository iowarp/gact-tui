/**
 * UI component: Workspace Switcher. Renders `WorkspaceSwitcher` from `WorkspaceSwitcherProps`.
 */
import { For, Show, createSignal } from 'solid-js';
import { Icon } from './Icon.js';
import type { WorkspaceOption } from './SessionsColumnModel.js';

export interface WorkspaceSwitcherProps {
  workspaces: WorkspaceOption[];
  selectedId: string;
  onPick: (id: string) => void;
}

export function WorkspaceSwitcher(props: WorkspaceSwitcherProps) {
  const [open, setOpen] = createSignal(false);
  const selected = () => {
    if (props.selectedId === '__all') return null;
    return props.workspaces.find((workspace) => workspace.id === props.selectedId) ?? null;
  };

  return (
    <div class="sx__ws" data-testid="workspace-switcher">
      <button
        type="button"
        class="sx__ws-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
        aria-haspopup="listbox"
      >
        <Icon name="workspaces" size={12} />
        <span class="sx__ws-name">{selected() ? selected()!.name : 'All workspaces'}</span>
        <Icon name="chevron-down" size={10} />
      </button>
      <Show when={open()}>
        <div class="sx__ws-menu" role="listbox" onMouseLeave={() => setOpen(false)}>
          <button
            type="button"
            role="option"
            aria-selected={props.selectedId === '__all'}
            class={'sx__ws-item ' + (props.selectedId === '__all' ? 'is-active' : '')}
            onClick={() => {
              props.onPick('__all');
              setOpen(false);
            }}
          >
            <span>All workspaces</span>
            <Show when={props.selectedId === '__all'}>
              <Icon name="check" size={10} />
            </Show>
          </button>
          <For each={props.workspaces}>
            {(workspace) => (
              <button
                type="button"
                role="option"
                aria-selected={workspace.id === props.selectedId}
                class={'sx__ws-item ' + (workspace.id === props.selectedId ? 'is-active' : '')}
                onClick={() => {
                  props.onPick(workspace.id);
                  setOpen(false);
                }}
              >
                <div>
                  <div class="sx__ws-item-name">{workspace.name}</div>
                  <Show when={workspace.rootPath}>
                    <div class="sx__ws-item-path">{workspace.rootPath}</div>
                  </Show>
                </div>
                <Show when={workspace.id === props.selectedId}>
                  <Icon name="check" size={10} />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
