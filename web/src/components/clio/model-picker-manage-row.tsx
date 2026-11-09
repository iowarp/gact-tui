import type { LanguageModelPreset } from '@clio/core/v3';
import type { ProviderGroup } from './model-picker-model';
import { useProviderPanel } from './model-picker-provider-panel';

interface ProviderManageRowProps {
  group: ProviderGroup;
  preset: LanguageModelPreset | undefined;
  onClose?: () => void;
  fold?: boolean;
}

/**
 * One column: the row that ends a provider's group, with its status and the
 * provider bar's actions (pickers-search.html, "a manage row ends each group").
 */
export function ProviderManageRow({ group, preset, onClose, fold }: ProviderManageRowProps) {
  const panel = useProviderPanel({
    group,
    preset,
    open: true,
    onClose,
    autoCheck: false,
    foldActions: fold,
  });
  return panel.column.manage ?? null;
}
