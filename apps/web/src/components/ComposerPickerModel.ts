/**
 * View-model / pure logic for Composer Picker: state shaping and helpers, no DOM. Key export `PERMISSION_MODES`.
 */
import type { DropdownItem } from './Dropdown.js';
import type { ModelOption, PermissionMode } from './ComposerTypes.js';

const PERM_DESCRIPTIONS: Record<PermissionMode, string> = {
  ask: 'Prompt me before every tool call',
  'auto-edits': 'Auto-approve safe file edits; ask for the rest',
  plan: 'Read-only — plan changes, never apply',
  auto: 'Auto-approve every action (use with care)',
  bypass: 'Skip permissions entirely',
};

export const PERMISSION_MODES: PermissionMode[] = ['ask', 'auto-edits', 'plan', 'auto', 'bypass'];

export function buildPermissionItems(): DropdownItem<PermissionMode>[] {
  return PERMISSION_MODES.map((mode) => ({
    id: mode,
    label: mode,
    description: PERM_DESCRIPTIONS[mode],
    value: mode,
  }));
}

export function buildModelItems(models: readonly ModelOption[] = []): DropdownItem<ModelOption>[] {
  return models.map((model) => ({
    id: model.id,
    label: model.modelId,
    detail: model.providerLabel,
    description: model.description,
    group: model.providerLabel,
    value: model,
  }));
}

export function selectedModelForId(
  models: readonly ModelOption[] = [],
  selectedModelId: string,
): ModelOption | undefined {
  return models.find((model) => model.id === selectedModelId);
}
