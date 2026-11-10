import type { MessageBehavior, ReasoningEffort, SpotterAvailability } from '@clio/core/v3';
import { memo, useMemo, type ReactNode } from 'react';
import type { ClioModelOption } from '@/lib/model-options';
import { ComposerAddContextButtons } from './composer-add-context-button';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';
import { ClioComposerEvidenceControls } from './composer-evidence-controls';
import { ComposerModelControl } from './composer-model-control';
import { ComposerSpotterModel } from './composer-spotter-model';

const NO_LEVELS: readonly ReasoningEffort[] = [];

export interface ComposerToolbarControlsProps {
  attachments: boolean;
  contextReferences: boolean;
  capabilitiesPending: boolean;
  sourcesOffered: boolean;
  sourcesPending: boolean;
  disabled: boolean;
  onOpenSources: () => void;
  onOpenReferences: () => void;
  onReturnFocus: () => void;
  executionMode: MessageBehavior['execution_mode'];
  confirmationPolicy: MessageBehavior['confirmation_policy'];
  reasoningEffort: MessageBehavior['reasoning_effort'];
  onBehaviorChange: (behavior: MessageBehavior) => void;
  activityControl?: ReactNode;
  workSummary?: ReactNode;
  spotterAvailability?: SpotterAvailability;
  spotterModel: string;
  onSpotterModelChange: (ref: string) => void;
  modelCatalogStatus: 'error' | 'loading' | 'ready';
  modelOptions: readonly ClioModelOption[];
  onRetryModelCatalog?: (providerId?: string) => void;
  selectedModel?: ClioModelOption;
  modelProblemLabel?: string;
  modelProblemDetail?: string;
  onModelChange: (option: ClioModelOption) => void;
  reasoningPending: boolean;
  defaultEffortLabel: string;
  unrecognizedEffort?: string;
}

/**
 * Everything in the composer row before its status and send square: `+`, `@`,
 * approval, effort, mode and the model chip. Memoized on plain values and
 * stable handlers, so typing re-renders the editor and the send square but not
 * these menus and their tooltips.
 */
export const ComposerToolbarControls = memo(function ComposerToolbarControls({
  attachments,
  contextReferences,
  capabilitiesPending,
  sourcesOffered,
  sourcesPending,
  disabled,
  onOpenSources,
  onOpenReferences,
  onReturnFocus,
  executionMode,
  confirmationPolicy,
  reasoningEffort,
  onBehaviorChange,
  activityControl,
  workSummary,
  spotterAvailability,
  spotterModel,
  onSpotterModelChange,
  modelCatalogStatus,
  modelOptions,
  onRetryModelCatalog,
  selectedModel,
  modelProblemLabel,
  modelProblemDetail,
  onModelChange,
  reasoningPending,
  defaultEffortLabel,
  unrecognizedEffort,
}: ComposerToolbarControlsProps) {
  const behavior = useMemo<MessageBehavior>(
    () => ({
      confirmation_policy: confirmationPolicy,
      execution_mode: executionMode,
      reasoning_effort: reasoningEffort,
    }),
    [confirmationPolicy, executionMode, reasoningEffort],
  );
  const problem = useMemo(
    () =>
      modelProblemLabel !== undefined && modelProblemDetail !== undefined
        ? { label: modelProblemLabel, detail: modelProblemDetail }
        : undefined,
    [modelProblemDetail, modelProblemLabel],
  );
  return (
    <>
      {attachments || contextReferences || capabilitiesPending ? (
        <ComposerAddContextButtons
          attachments={attachments}
          contextReferences={contextReferences}
          pending={capabilitiesPending}
          sourcesPending={sourcesPending}
          disabled={disabled}
          onOpenSources={sourcesOffered ? onOpenSources : undefined}
          onOpenReferences={onOpenReferences}
          onReturnFocus={onReturnFocus}
        />
      ) : null}
      <ClioComposerBehaviorControls
        behavior={behavior}
        beforeModel={
          <ClioComposerEvidenceControls
            activityControl={activityControl}
            workSummary={workSummary}
          />
        }
        spotterAvailability={spotterAvailability}
        spotterModelControl={
          <ComposerSpotterModel
            catalogStatus={modelCatalogStatus}
            disabled={disabled}
            onChange={onSpotterModelChange}
            onRetryCatalog={onRetryModelCatalog}
            options={modelOptions}
            value={spotterModel}
          />
        }
        reasoningLevels={selectedModel?.reasoning?.levels ?? NO_LEVELS}
        reasoningPending={reasoningPending}
        defaultEffortLabel={defaultEffortLabel}
        disabled={disabled}
        modelControl={
          <ComposerModelControl
            catalogStatus={modelCatalogStatus}
            onChange={onModelChange}
            onRetryCatalog={onRetryModelCatalog}
            options={modelOptions}
            problem={problem}
            returnFocus={onReturnFocus}
            selected={selectedModel}
          />
        }
        onChange={onBehaviorChange}
        onReturnFocus={onReturnFocus}
        unrecognizedEffort={unrecognizedEffort}
      />
    </>
  );
});
