/**
 * UI component: Composer Pickers. Renders `ComposerPickers` from `ComposerPickersProps`.
 */
import { Show, type JSX } from 'solid-js';
import { Dropdown, type DropdownItem } from './Dropdown.js';
import type { ModelOption, ModelProviderOption, PermissionMode } from './ComposerTypes.js';
import { ProviderModelPicker } from './ProviderModelPicker.js';

export interface ComposerPickersProps {
  backendLabel?: string;
  backendSlot?: JSX.Element;
  permMode: PermissionMode;
  permItems: DropdownItem<PermissionMode>[];
  modelProviders?: ModelProviderOption[];
  modelItems: DropdownItem<ModelOption>[];
  selectedModelId: string;
  selectedModelLabel: string;
  onPickPermMode: (mode: PermissionMode) => void;
  onPickModel: (item: DropdownItem<ModelOption>) => void;
}

export function ComposerPickers(props: ComposerPickersProps) {
  return (
    <div class="composer__pickers">
      <Show when={props.backendSlot}>{props.backendSlot}</Show>
      <Dropdown
        testid="composer-perm"
        label={props.permMode}
        icon="circle"
        items={props.permItems}
        selectedId={props.permMode}
        onPick={(item) => props.onPickPermMode(item.value)}
      />
      <ProviderModelPicker
        providers={props.modelProviders ?? []}
        fallbackItems={props.modelItems}
        selectedModelId={props.selectedModelId}
        selectedModelLabel={props.selectedModelLabel}
        onPickModel={(model) =>
          props.onPickModel({
            id: model.id,
            label: model.modelId,
            value: model,
          })
        }
      />
    </div>
  );
}
