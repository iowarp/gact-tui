import type { ClioModelOption } from '@/lib/model-options';
import { ComposerModelButton } from './composer-model-label';
import { ClioModelPicker } from './model-picker';

/** The composer's model chip and the picker it opens (`Ctrl '`). */
export function ComposerModelControl({
  catalogStatus,
  onChange,
  onRetryCatalog,
  options,
  selected,
}: {
  catalogStatus: 'error' | 'loading' | 'ready';
  onChange: (option: ClioModelOption) => void;
  onRetryCatalog?: (providerId?: string) => void;
  options: readonly ClioModelOption[];
  selected?: ClioModelOption;
}) {
  return (
    <ClioModelPicker
      catalogStatus={catalogStatus}
      model={selected?.id}
      onChange={onChange}
      onRetryCatalog={onRetryCatalog}
      options={options}
      provider={selected?.providerId}
      placement="composer"
      shortcut="model-picker"
      trigger={
        <ComposerModelButton
          appearance="text"
          aria-label="Change model"
          className="max-w-56 @min-[48rem]/composer:max-w-72"
          option={selected}
          shortcut="model-picker"
          type="button"
          variant="ghost"
        />
      }
    />
  );
}
