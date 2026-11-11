import type { ToolCallers, ToolPermission, ToolSetting } from '@clio/core/v3';
import { EyeIcon } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { DeleteIcon, EditIcon, HelpIcon } from '@/lib/icon-vocabulary';
import { CALLERS_TEXT, PERMISSION_TEXT } from './plugin-tool-settings-text';
import type { ToolEditor } from './settings-tools-editor';
import type { PickerOption } from './settings-tools-picker';
import { CALLERS, CALLERS_ICON, PERMISSION_ICON, PERMISSIONS } from './settings-tools-columns';

export type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export function toolKind(tool: ToolSetting): { icon: Icon; label: string } {
  if (!tool.flags_known) return { icon: HelpIcon, label: 'Flags not loaded yet' };
  if (tool.read_only) return { icon: EyeIcon, label: 'Read-only' };
  if (tool.destructive) return { icon: DeleteIcon, label: 'Destructive' };
  return { icon: EditIcon, label: 'Writes or acts' };
}

export function permissionOptions(defaultValue?: ToolPermission): PickerOption<ToolPermission>[] {
  return PERMISSIONS.map((value) => ({
    value,
    label: PERMISSION_TEXT[value].label,
    description: PERMISSION_TEXT[value].detail,
    icon: PERMISSION_ICON[value],
    isDefault: value === defaultValue,
  }));
}

export function callersOptions(defaultValue?: ToolCallers | ''): PickerOption<ToolCallers>[] {
  return CALLERS.map((value) => ({
    value,
    label: CALLERS_TEXT[value].label,
    description: CALLERS_TEXT[value].detail,
    icon: CALLERS_ICON[value],
    isDefault: value === defaultValue,
  }));
}

export function valueTitle(label: string, isDefault: boolean): string {
  return isDefault ? `${label} (default; choose a value to override it)` : `${label} (your choice)`;
}

/** A row's save and rule removal: stable across renders, so rows can skip re-rendering. */
export type RowEditor = Pick<ToolEditor, 'save' | 'removeRule'>;
