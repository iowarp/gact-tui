import { Checkpoint, CheckpointIcon } from '@/components/ai-elements/checkpoint';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { providerDisplayName, providerLogoId } from '@/lib/provider-presentation';
import type { ConversationModelBoundary } from './conversation-model-boundaries';

function modelLabel(model: NonNullable<ConversationModelBoundary['model']>): string {
  return `${providerDisplayName(undefined, model.provider_id)} · ${model.model_id}`;
}

/** The shared AI Elements checkpoint marks the beginning of each model segment. */
export function ConversationModelCheckpoint({ boundary }: { boundary: ConversationModelBoundary }) {
  const label = boundary.model
    ? `${boundary.previous ? 'Switched to' : 'Using'} ${modelLabel(boundary.model)}`
    : 'Model not recorded';
  const accessibleLabel = boundary.previous
    ? `${label}. Previous model: ${modelLabel(boundary.previous)}`
    : label;
  return (
    <Checkpoint
      aria-label={accessibleLabel}
      className="mb-5 mt-3 min-w-0 gap-2 [&>[data-slot=separator]]:min-w-4 [&>[data-slot=separator]]:flex-1 [&>[data-slot=separator]]:w-auto"
      data-slot="model-checkpoint"
      data-provider-id={boundary.model?.provider_id}
      data-model-id={boundary.model?.model_id}
      role="separator"
    >
      <CheckpointIcon aria-hidden="true">
        {boundary.model ? (
          <ModelSelectorLogo provider={providerLogoId(boundary.model.provider_id)} />
        ) : undefined}
      </CheckpointIcon>
      <span className="min-w-0 shrink text-xs leading-5 [overflow-wrap:anywhere]">{label}</span>
    </Checkpoint>
  );
}
