import { RadarIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import type { ClioModelOption } from '@/lib/model-options';
import { parseSpotterModelRef, spotterModelRef } from '@/lib/spotter-model-ref';
import { ClioModelPicker } from './model-picker';
import { IconButton } from './primitives/icon-button';

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

/** The model SPOTTER review runs on in this conversation, as icons beside the policy control. */
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
          <IconButton
            className={choice ? 'text-accent-foreground hover:text-accent-foreground' : undefined}
            disabled={disabled}
            icon={<RadarIcon />}
            label={`SPOTTER model: ${label}`}
            size="toolbar"
            tooltipSide="top"
            type="button"
          />
        }
      />
      {choice ? (
        <IconButton
          disabled={disabled}
          icon={<RetryIcon />}
          label="Use conversation model for SPOTTER"
          onClick={() => onChange('')}
          size="toolbar"
          tooltipSide="top"
          type="button"
        />
      ) : null}
    </>
  );
}
