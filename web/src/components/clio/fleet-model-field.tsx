import { Undo2Icon } from 'lucide-react';
import type { ClioModelOption } from '@/lib/model-options';
import { ModelSelectField } from './model-select-field';
import { IconButton } from './primitives/icon-button';

export interface FleetChoice {
  provider_id: string;
  model_id: string;
}

/**
 * One fleet model choice (fast model, a helper's model): the shared model
 * select, with ↶ returning it to its automatic default (`resetLabel`).
 */
export function FleetModelField({
  id,
  label,
  pickerTitle,
  choice,
  unset,
  resetLabel,
  options,
  catalogStatus,
  onRetryCatalog,
  busy,
  disabled = false,
  onChoose,
  onReset,
}: {
  id: string;
  label: string;
  pickerTitle: string;
  choice: FleetChoice | null | undefined;
  unset: string;
  resetLabel: string;
  options: ClioModelOption[];
  catalogStatus: 'loading' | 'error' | 'ready';
  onRetryCatalog: () => void;
  busy: boolean;
  disabled?: boolean;
  onChoose: (model: ClioModelOption) => void;
  onReset: () => void;
}) {
  const option = choice
    ? options.find(
        (candidate) =>
          candidate.providerId === choice.provider_id && candidate.id === choice.model_id,
      )
    : undefined;
  return (
    // The select fills the value column; inline-size containment keeps a long
    // model name from widening that column, so every select shares one left
    // edge. The reset sits just outside it, in the gap before the column; when
    // the row stacks it moves up to the end of the label line, so the select
    // keeps the row's full width.
    <div className="relative flex w-full min-w-0 items-center gap-2 [contain:inline-size]">
      {choice ? (
        <IconButton
          className="absolute right-0 bottom-[calc(100%+0.375rem)] @md:right-full @md:bottom-auto @md:mr-2 max-[1023px]:in-data-window-content:right-0! max-[1023px]:in-data-window-content:bottom-[calc(100%+0.375rem)]! max-[1023px]:in-data-window-content:mr-0!"
          disabled={busy || disabled}
          icon={<Undo2Icon />}
          label={resetLabel}
          onClick={onReset}
          size="sm"
        />
      ) : null}
      <ModelSelectField
        busy={busy}
        catalogStatus={catalogStatus}
        disabled={disabled}
        id={id}
        label={label}
        modelId={choice?.model_id}
        onChange={onChoose}
        onRetryCatalog={onRetryCatalog}
        option={option}
        options={options}
        placeholder={unset}
        providerId={choice?.provider_id}
        title={pickerTitle}
      />
    </div>
  );
}
