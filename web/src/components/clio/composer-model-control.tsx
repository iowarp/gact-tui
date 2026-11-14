import type { ClioModelOption } from '@/lib/model-options';
import { ComposerModelButton } from './composer-model-label';
import { ClioModelPicker } from './model-picker';
import { t } from '@lingui/core/macro';

/** The composer's model chip and the picker it opens (`Ctrl '`). */
export function ComposerModelControl({
  catalogStatus,
  onChange,
  onRetryCatalog,
  options,
  problem,
  returnFocus,
  selected,
}: {
  catalogStatus: 'error' | 'loading' | 'ready';
  onChange: (option: ClioModelOption) => void;
  onRetryCatalog?: (providerId?: string) => void;
  options: readonly ClioModelOption[];
  /** Shown on the chip when no model can be: why, as a word and a sentence. */
  problem?: { label: string; detail: string };
  /** Focus the editor after a pick, or after a shortcut-opened picker closes. */
  returnFocus?: () => void;
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
      returnFocus={returnFocus}
      shortcut="model-picker"
      trigger={
        <ComposerModelButton
          appearance="text"
          aria-label={t`Change model`}
          className="max-w-56 @min-[48rem]/composer:max-w-72"
          data-tour="model-picker"
          option={selected}
          problem={problem}
          shortcut="model-picker"
          type="button"
          variant="ghost"
        />
      }
    />
  );
}
