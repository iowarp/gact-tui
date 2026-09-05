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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { DOCUMENT_MARKDOWN_CLASS_NAME } from '@/lib/document-markdown';
import { respondFromControl } from './interaction-control';
import { InteractionFrameHeader } from './interaction-frame-header';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { ClioArtifactAttachments } from './artifact-card';

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
  const [decision, setDecision] = useState('');
  const [clearContext, setClearContext] = useState(false);
  const [feedback, setFeedback] = useState('');
  const plan = interaction.payload?.plan_exit;
  const options = interaction.payload?.options ?? [];
  const decisions = options.filter((option) => (option.value || option.label) !== 'clear_context');
  const clearOption = options.find((option) => (option.value || option.label) === 'clear_context');
  const rejectionNeedsFeedback = decision === 'reject' && !feedback.trim();
  const canAnswer =
    interaction.status === 'pending' && (interaction.actions ?? []).includes('answer');
  const requiresCompleteReview = decision === 'auto' || decision === 'interactive';
  const planReviewComplete =
    plan?.plan_content_status === 'complete' && Boolean(plan.plan_content?.trim());
  const canSubmit =
    canAnswer &&
    Boolean(decision) &&
    !rejectionNeedsFeedback &&
    (!requiresCompleteReview || planReviewComplete);

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
                  ? `Saved plan · ${plan.plan_file}`
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
          </PlanContent>
          <PlanFooter className="flex-col items-start gap-1 border-t text-xs text-muted-foreground">
            {plan?.recommended_mode ? (
              <span>
                Agent recommendation: <strong>{plan.recommended_mode}</strong>
              </span>
            ) : null}
            {plan?.risk_notes ? <span>Risks: {plan.risk_notes}</span> : null}
            {plan?.plan_content_status === 'truncated' ? (
              <span className="text-warning">
                The review is truncated ({plan.plan_content_included_chars} of{' '}
                {plan.plan_content_chars} characters). Automatic execution remains unavailable until
                the complete plan can be reviewed.
              </span>
            ) : null}
            {plan?.plan_content_status === 'unavailable' ? (
              <span className="text-destructive">
                The saved plan is unavailable. Automatic execution remains unavailable; reject it
                for revision or exit Plan mode without executing.
              </span>
            ) : null}
          </PlanFooter>
        </Plan>

        {interaction.status !== 'pending' ? (
          <PlanDecision interaction={interaction} options={options} />
        ) : !canAnswer ? (
          <p className="text-sm text-muted-foreground">Plan controls are not available yet.</p>
        ) : (
          <>
            <RadioGroup disabled={disabled} onValueChange={setDecision} value={decision}>
              {decisions.map((option) => {
                const value = option.value || option.label;
                const label = value === 'reject' ? 'Request changes' : option.label;
                return (
                  <FieldLabel htmlFor={`${interaction.id}-${value}`} key={value}>
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        aria-label={label}
                        id={`${interaction.id}-${value}`}
                        value={value}
                      />
                      <FieldContent>
                        <FieldTitle>{label}</FieldTitle>
                        {option.description ? (
                          <FieldDescription>{option.description}</FieldDescription>
                        ) : null}
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                );
              })}
            </RadioGroup>
            {clearOption ? (
              <FieldLabel className="mt-2" htmlFor={`${interaction.id}-clear-context`}>
                <Field orientation="horizontal">
                  <Checkbox
                    aria-label={clearOption.label}
                    checked={clearContext}
                    disabled={disabled}
                    id={`${interaction.id}-clear-context`}
                    onCheckedChange={(checked) => setClearContext(checked === true)}
                  />
                  <FieldContent>
                    <FieldTitle>{clearOption.label}</FieldTitle>
                    {clearOption.description ? (
                      <FieldDescription>{clearOption.description}</FieldDescription>
                    ) : null}
                  </FieldContent>
                </Field>
              </FieldLabel>
            ) : null}
            <div className="mt-3 grid min-w-0 gap-1">
              <FieldLabel htmlFor={`${interaction.id}-plan-feedback`}>
                {decision === 'reject' ? 'Revision feedback' : 'Comment (optional)'}
              </FieldLabel>
              <Textarea
                aria-label={decision === 'reject' ? 'Revision feedback' : 'Comment (optional)'}
                className="min-h-16 w-full resize-y field-sizing-fixed"
                disabled={disabled}
                id={`${interaction.id}-plan-feedback`}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder={
                  decision === 'reject'
                    ? 'Explain what the agent should revise before asking again.'
                    : 'Add context for execution'
                }
                value={feedback}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                disabled={disabled || !canSubmit}
                onClick={() =>
                  respondFromControl(
                    onResponse(interaction, {
                      action: 'answer',
                      answer: feedback.trim() || undefined,
                      selected_options: [decision, ...(clearContext ? ['clear_context'] : [])],
                    }),
                  )
                }
              >
                Submit plan decision
              </Button>
            </div>
          </>
        )}
      </FramePanel>
    </Frame>
  );
}

function PlanDecision({
  interaction,
  options,
}: {
  interaction: PendingInteraction;
  options: Array<{ label: string; value: string; description?: string }>;
}) {
  const selected = selectedOptions(interaction);
  const decision = selected.find((value) => value !== 'clear_context');
  const option = options.find((candidate) => (candidate.value || candidate.label) === decision);
  const label =
    decision === 'reject'
      ? 'Changes requested'
      : decision
        ? `Approved · ${option?.label ?? decision}`
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
    </div>
  );
}

function selectedOptions(interaction: PendingInteraction): string[] {
  const raw = interaction.payload?.answer_metadata?.selected_options;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string')
    : [];
}

function planArtifact(
  interaction: PendingInteraction,
  artifacts: Record<string, Artifact>,
): Artifact | undefined {
  const planFile = interaction.payload?.plan_exit?.plan_file;
  const name = planFile?.replaceAll('\\', '/').split('/').at(-1)?.toLocaleLowerCase();
  if (!name) return undefined;
  return Object.values(artifacts).find((artifact) => artifact.name.toLocaleLowerCase() === name);
}
