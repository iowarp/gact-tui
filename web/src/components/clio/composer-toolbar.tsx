import type { MessageBehavior, RunState } from '@clio/core/v3';
import { memo, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import { PromptInputFooter } from '@/components/ai-elements/prompt-input';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ModelReasoningLevels } from '@/lib/reasoning-levels';
import { ComposerAddContextButtons } from './composer-add-context-button';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';
import { ClioComposerEvidenceControls } from './composer-evidence-controls';
import { ComposerModelControl } from './composer-model-control';
import { ComposerSpotterModel } from './composer-spotter-model';
import { ComposerSubmitControls } from './composer-submit-controls';
import { ComposerToolbarStatus } from './composer-toolbar-status';

type ModelControlProps = ComponentProps<typeof ComposerModelControl>;

export interface ComposerToolbarProps {
  attachments: boolean;
  contextReferences: boolean;
  capabilitiesPending: boolean;
  sourcesPending: boolean;
  controlsDisabled: boolean;
  onOpenSources?: () => void;
  onOpenReferences: () => void;
  onReturnFocus: (offset?: number) => void;
  behavior: MessageBehavior;
  activityControl?: ReactNode;
  workSummary?: ReactNode;
  spotterAvailability: ComponentProps<typeof ClioComposerBehaviorControls>['spotterAvailability'];
  spotterModel: string;
  onSpotterModelChange: (ref: string) => void;
  catalogStatus: ModelControlProps['catalogStatus'];
  onRetryCatalog?: (providerId?: string) => void;
  modelOptions: ModelControlProps['options'];
  selectedModel: ModelControlProps['selected'];
  onSelectModel: ModelControlProps['onChange'];
  reasoningLevels: ModelReasoningLevels['levels'];
  reasoningPending: boolean;
  defaultEffortLabel: string;
  onBehaviorChange: (behavior: MessageBehavior) => void;
  unrecognizedEffort?: string;
  /** Strings, not an object, so the memo holds across renders. */
  modelProblemLabel?: string;
  modelProblemDetail?: string;
  connecting: boolean;
  held: boolean;
  offline: boolean;
  sending: boolean;
  preparing: boolean;
  state: RunState;
  hasContent: boolean;
  submitDisabled: boolean;
  onSubmitClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onStop?: () => void;
}

/**
 * The composer's control row: add context, behavior and model, status and the
 * send square. Memoized apart from the editor, so a keystroke re-renders only
 * the text box, not every menu and tooltip in the row.
 */
export const ComposerToolbar = memo(function ComposerToolbar({
  attachments,
  contextReferences,
  capabilitiesPending,
  sourcesPending,
  controlsDisabled,
  onOpenSources,
  onOpenReferences,
  onReturnFocus,
  behavior,
  activityControl,
  workSummary,
  spotterAvailability,
  spotterModel,
  onSpotterModelChange,
  catalogStatus,
  onRetryCatalog,
  modelOptions,
  selectedModel,
  onSelectModel,
  reasoningLevels,
  reasoningPending,
  defaultEffortLabel,
  onBehaviorChange,
  unrecognizedEffort,
  modelProblemLabel,
  modelProblemDetail,
  connecting,
  held,
  offline,
  sending,
  preparing,
  state,
  hasContent,
  submitDisabled,
  onSubmitClick,
  onStop,
}: ComposerToolbarProps) {
  return (
    <TooltipProvider delayDuration={450}>
      <PromptInputFooter
        className="@container/composer mt-3 -ml-1.5 min-h-[30px] w-[calc(100%+0.375rem)] min-w-0 cursor-default flex-nowrap justify-start gap-[2px] p-0 font-normal group-has-[>input]/input-group:pb-0"
        data-slot="composer-toolbar"
      >
        {attachments || contextReferences || capabilitiesPending ? (
          <ComposerAddContextButtons
            attachments={attachments}
            contextReferences={contextReferences}
            pending={capabilitiesPending}
            sourcesPending={sourcesPending}
            disabled={controlsDisabled}
            onOpenSources={onOpenSources}
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
              catalogStatus={catalogStatus}
              disabled={controlsDisabled}
              onChange={onSpotterModelChange}
              onRetryCatalog={onRetryCatalog}
              options={modelOptions}
              value={spotterModel}
            />
          }
          reasoningLevels={reasoningLevels}
          reasoningPending={reasoningPending}
          defaultEffortLabel={defaultEffortLabel}
          disabled={controlsDisabled}
          modelControl={
            <ComposerModelControl
              catalogStatus={catalogStatus}
              onChange={onSelectModel}
              onRetryCatalog={onRetryCatalog}
              options={modelOptions}
              problem={
                modelProblemLabel
                  ? { label: modelProblemLabel, detail: modelProblemDetail ?? '' }
                  : undefined
              }
              returnFocus={onReturnFocus}
              selected={selectedModel}
            />
          }
          onChange={onBehaviorChange}
          onReturnFocus={onReturnFocus}
          unrecognizedEffort={unrecognizedEffort}
        />
        <ComposerToolbarStatus
          connecting={connecting}
          held={held}
          offline={offline}
          sending={sending}
          preparing={preparing}
        />
        <ComposerSubmitControls
          state={state}
          hasContent={hasContent}
          disabled={submitDisabled}
          onSubmit={onSubmitClick}
          onStop={onStop}
        />
      </PromptInputFooter>
    </TooltipProvider>
  );
}, sameToolbarProps);

/** Shallow equality, except the behavior, which the composer rebuilds on every render. */
function sameToolbarProps(previous: ComposerToolbarProps, next: ComposerToolbarProps): boolean {
  for (const key of Object.keys(next) as (keyof ComposerToolbarProps)[]) {
    if (key === 'behavior') continue;
    if (!Object.is(previous[key], next[key])) return false;
  }
  if (Object.keys(previous).length !== Object.keys(next).length) return false;
  const a = previous.behavior;
  const b = next.behavior;
  return (
    a === b ||
    (Object.keys(a).length === Object.keys(b).length &&
      (Object.keys(b) as (keyof MessageBehavior)[]).every((key) => Object.is(a[key], b[key])))
  );
}
