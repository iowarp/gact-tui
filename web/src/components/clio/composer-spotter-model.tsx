import { RadarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RetryIcon } from '@/lib/icon-vocabulary';
import type { ClioModelOption } from '@/lib/model-options';
import { parseSpotterModelRef, spotterModelRef } from '@/lib/spotter-model-ref';
import { ClioModelPicker } from './model-picker';

interface ComposerSpotterModelProps {
  /** The session's fleet reference; empty uses the conversation's model. */
  value: string;
  options: readonly ClioModelOption[];
  catalogStatus?: 'error' | 'loading' | 'ready';
  disabled?: boolean;
  onRetryCatalog?: (providerId?: string) => void;
  /** Receives a fleet reference, or empty to use the conversation's model. */
  onChange: (ref: string) => void;
}

/** The model SPOTTER review runs on in this conversation, beside the approval control. */
export function ComposerSpotterModel({
  value,
  options,
  catalogStatus,
  disabled,
  onRetryCatalog,
  onChange,
}: ComposerSpotterModelProps) {
  const choice = parseSpotterModelRef(value);
  const option = choice
    ? options.find(
        (candidate) =>
          candidate.providerId === choice.providerId && candidate.id === choice.modelId,
      )
    : undefined;
  const label = choice
    ? option
      ? `${option.providerName} / ${option.label}`
      : value
    : 'Conversation model';
  return (
    <>
      <ClioModelPicker
        catalogStatus={catalogStatus}
        model={choice?.modelId}
        onChange={(next) => onChange(spotterModelRef(next))}
        onRetryCatalog={onRetryCatalog}
        options={options}
        provider={choice?.providerId}
        title="Choose SPOTTER model"
        trigger={
          <Button
            aria-label={`SPOTTER model: ${label}`}
            className="min-w-0 gap-1.5 px-2"
            disabled={disabled}
            size="sm"
            title={`SPOTTER model: ${label}`}
            type="button"
            variant="outline"
          >
            <RadarIcon />
            <span className="hidden max-w-40 truncate lg:inline">{label}</span>
          </Button>
        }
      />
      {choice ? (
        <Button
          aria-label="Use conversation model for SPOTTER"
          className="px-2"
          disabled={disabled}
          onClick={() => onChange('')}
          size="sm"
          title="Use conversation model for SPOTTER"
          type="button"
          variant="outline"
        >
          <RetryIcon />
        </Button>
      ) : null}
    </>
  );
}
