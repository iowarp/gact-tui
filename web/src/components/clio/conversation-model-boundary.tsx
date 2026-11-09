import { providerDisplayName } from '@/lib/provider-presentation';
import { StateView } from './primitives/state-view';
import type { ConversationModelBoundary } from './conversation-model-boundaries';

function modelLabel(model: NonNullable<ConversationModelBoundary['model']>): string {
  return `${providerDisplayName(undefined, model.provider_id)}, ${model.model_id}`;
}

/**
 * A quiet line where the conversation changes model. The first model is not
 * announced: each reply's footer names the model that wrote it.
 */
export function ConversationModelCheckpoint({ boundary }: { boundary: ConversationModelBoundary }) {
  if (boundary.initial) return null;
  const label = boundary.model
    ? `${boundary.previous ? 'Switched to' : 'Using'} ${modelLabel(boundary.model)}`
    : 'Model not recorded';
  const accessibleLabel = boundary.previous
    ? `${label}. Previous model: ${modelLabel(boundary.previous)}`
    : label;
  return (
    <div
      aria-label={accessibleLabel}
      className="my-1 min-w-0"
      data-slot="model-checkpoint"
      data-provider-id={boundary.model?.provider_id}
      data-model-id={boundary.model?.model_id}
      role="separator"
    >
      <StateView kind="marker" size="row" title={label} />
    </div>
  );
}
