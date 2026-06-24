/**
 * UI component: Composer Pickers. Renders `ComposerPickers` from `ComposerPickersProps`.
 */
import { Show, type JSX } from 'solid-js';
import { Dropdown, type DropdownItem } from './Dropdown.js';
import { Icon } from './Icon.js';
import type { ModelOption, PermissionMode } from './ComposerTypes.js';

export interface ComposerPickersProps {
  backendLabel?: string;
  backendSlot?: JSX.Element;
  permMode: PermissionMode;
  permItems: DropdownItem<PermissionMode>[];
  modelItems: DropdownItem<ModelOption>[];
  selectedModelId: string;
  selectedModelLabel: string;
  onPickPermMode: (mode: PermissionMode) => void;
  onPickModel: (item: DropdownItem<ModelOption>) => void;
}

export function ComposerPickers(props: ComposerPickersProps) {
  return (
    <div class="composer__pickers">
      <Show
        when={props.backendSlot}
        fallback={
          <button type="button" class="composer__picker" data-testid="composer-backend">
            <span class="sx__pip sx__pip--idle" style="width:6px;height:6px" />
            {props.backendLabel ?? 'localhost'}
            <Icon name="chevron-down" size={10} />
          </button>
        }
      >
        {props.backendSlot}
      </Show>
      <Dropdown
        testid="composer-perm"
        label={props.permMode}
        icon="circle"
        items={props.permItems}
        selectedId={props.permMode}
        onPick={(item) => props.onPickPermMode(item.value)}
      />
      <Dropdown
        testid="composer-model"
        label={props.selectedModelLabel}
        icon="sparkle"
        items={props.modelItems}
        selectedId={props.selectedModelId}
        emptyHint="No providers configured"
        onPick={props.onPickModel}
      />
    </div>
  );
}
