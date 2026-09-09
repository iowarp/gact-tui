import type { Artifact, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan';
import { Frame, FramePanel } from '@/components/reui/frame';
import { PlanDecisionControls } from './plan-decision-controls';
import { planModeLabel } from './plan-mode-label';
import { DOCUMENT_MARKDOWN_CLASS_NAME } from '@/lib/document-markdown';
import { respondFromControl } from './interaction-control';
import { InteractionFrameHeader } from './interaction-frame-header';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { ClioArtifactAttachments } from './artifact-card';
import { planArtifact } from './plan-artifact';

export function InlinePlanExitResponse({
  artifacts,
  interaction,
  onOpenArtifact,
  onResponse,
}: {
  artifacts: Record<string, Artifact>;
  interaction: PendingInteraction;
  onOpenArtifact?: (artifact: Artifact) => void;
  onResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState<Error>();
  const artifact = planArtifact(interaction, artifacts);
  const respond = async (target: PendingInteraction, response: PendingInteractionResponse) => {
    if (!onResponse || responding) return;
    setResponding(true);
    setResponseError(undefined);
    try {
      await onResponse(target, response);
    } catch (error) {
      setResponseError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      setResponding(false);
    }
  };
  return (
    <PlanExitResponse
      artifact={artifact}
      disabled={responding || !onResponse}
      interaction={interaction}
      onOpenArtifact={onOpenArtifact}
      onResponse={respond}
      responseError={responseError}
      showOwner={false}
    />
  );
}

export function PlanExitResponse({
  artifact,
  interaction,
  disabled,
  onOpenArtifact,
  onResponse,
  ownerLabel,
  responseError,
  showOwner,
}: {
  artifact?: Artifact;
  interaction: PendingInteraction;
  disabled?: boolean;
  onOpenArtifact?: (artifact: Artifact) => void;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
}) {
  const plan = interaction.payload?.plan_exit;
  const canAnswer =
    interaction.status === 'pending' && (interaction.actions ?? []).includes('answer');

  return (
    <Frame
      className="min-w-0 self-stretch border-sky-500/25 bg-sky-500/[0.035]"
      data-interaction-kind="plan_exit"
      dense
      spacing="sm"
    >
      <InteractionFrameHeader
        disabled={disabled}
        interaction={interaction}
        onCancel={
          (interaction.actions ?? []).includes('cancel')
            ? () => respondFromControl(onResponse(interaction, { action: 'cancel' }))
            : undefined
        }
        ownerLabel={ownerLabel}
        showOwner={showOwner}
      />
      <FramePanel className="min-w-0 overflow-hidden">
        <ResponseErrorNotice error={responseError} />
        {artifact ? (
          <ClioArtifactAttachments
            artifacts={[artifact]}
            className="mb-2"
            onOpen={onOpenArtifact}
          />
        ) : null}
        <Plan className="mb-3 bg-background/70" defaultOpen>
          <PlanHeader>
            <div className="min-w-0">
              <PlanTitle>{plan?.summary || 'Execution plan ready for review'}</PlanTitle>
              <PlanDescription>
                {plan?.plan_file
                  ? `Saved plan: ${plan.plan_file}`
                  : 'The agent has finished planning and is waiting for your decision.'}
              </PlanDescription>
            </div>
            <PlanAction>
              <PlanTrigger />
            </PlanAction>
          </PlanHeader>
          <PlanContent className="border-t pt-4">
            {plan?.plan_content ? (
              <MessageResponse className={DOCUMENT_MARKDOWN_CLASS_NAME}>
                {plan.plan_content}
              </MessageResponse>
            ) : (
              <p className="text-sm text-muted-foreground">
                The saved plan could not be loaded into this review.
              </p>
            )}
            {plan?.recommended_mode || plan?.risk_notes ? (
              <div className={DOCUMENT_MARKDOWN_CLASS_NAME} data-slot="plan-guidance">
                {plan.recommended_mode ? (
                  <section>
                    <h2>Execution recommendation</h2>
                    <p>{planModeLabel(plan.recommended_mode)}</p>
                  </section>
                ) : null}
                {plan.risk_notes ? (
                  <section>
                    <h2>Risks</h2>
                    <p>{plan.risk_notes}</p>
                  </section>
                ) : null}
              </div>
            ) : null}
          </PlanContent>
          {plan?.plan_content_status === 'truncated' ||
          plan?.plan_content_status === 'unavailable' ? (
            <PlanFooter className="flex-col items-start gap-1 border-t text-xs text-muted-foreground">
              {plan?.plan_content_status === 'truncated' ? (
                <span className="text-warning">
                  The review is truncated ({plan.plan_content_included_chars} of{' '}
                  {plan.plan_content_chars} characters). Automatic execution remains unavailable
                  until the complete plan can be reviewed.
                </span>
              ) : null}
              {plan?.plan_content_status === 'unavailable' ? (
                <span className="text-destructive">
                  The saved plan is unavailable. Automatic execution remains unavailable; reject it
                  for revision or exit Plan mode without executing.
                </span>
              ) : null}
            </PlanFooter>
          ) : null}
        </Plan>

        {interaction.status !== 'pending' ? (
          <PlanDecision interaction={interaction} />
        ) : !canAnswer ? (
          <p className="text-sm text-muted-foreground">Plan controls are not available yet.</p>
        ) : (
          <PlanDecisionControls
            interaction={interaction}
            disabled={disabled}
            onResponse={onResponse}
          />
        )}
      </FramePanel>
    </Frame>
  );
}

function PlanDecision({ interaction }: { interaction: PendingInteraction }) {
  const selected = selectedOptions(interaction);
  const decision = selected.find((value) => value !== 'clear_context');
  const label =
    decision === 'reject'
      ? 'Changes requested'
      : decision
        ? `Approved in ${planModeLabel(decision)} mode`
        : interaction.status === 'cancelled'
          ? 'Plan review cancelled'
          : interaction.status === 'expired'
            ? 'Plan review expired'
            : 'Plan decision recorded';
  return (
    <div
      className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm"
      data-plan-decision={decision || interaction.status}
      role="status"
    >
      <div className="font-medium text-foreground">{label}</div>
      {selected.includes('clear_context') ? (
        <p className="mt-1 text-xs text-muted-foreground">Conversation context was cleared.</p>
      ) : null}
      {decision === 'reject' && typeof interaction.payload?.answer_metadata?.answer === 'string' ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {interaction.payload.answer_metadata.answer}
        </p>
      ) : null}
    </div>
  );
}

function selectedOptions(interaction: PendingInteraction): string[] {
  const raw = interaction.payload?.answer_metadata?.selected_options;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string')
    : [];
}
