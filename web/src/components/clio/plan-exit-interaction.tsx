import type { Artifact, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useLayoutEffect, useRef, useState } from 'react';
import { NotebookTextIcon, PanelRightIcon } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AskButton, AskCard, AskError, AskKeyChip, AskSection } from './ask-card';
import { askKeyAttributes } from './ask-card-keys';
import { useAttentionDraft } from './attention-drafts';
import { pendingInteractionDomId } from './interaction-control';
import { OwnerAttribution } from './pending-interaction-notices';
import { PlanDecision, PlanDecisionControls } from './plan-decision-controls';
import { planArtifact } from './plan-artifact';
import { planModeLabel } from './plan-mode-label';
import { planOutline, planSections } from './plan-outline';
import { NamedTooltip } from './primitives/icon-button';
import { ActivityBody } from './activity-row';
import { CopyAction } from './tool-compact-row';

type PlanExit = NonNullable<NonNullable<PendingInteraction['payload']>['plan_exit']>;

// One scale: the plan's own title at 15px, section headings 12.5px medium, body 12.5px.
// `[&>*+*]` would compile to a universal sibling selector that restyles whole lists on any insert.
const PLAN_MARKDOWN =
  'min-w-0 text-[12.5px] leading-[1.55] text-foreground/90 [overflow-wrap:anywhere] [&>:where(:not(:first-child))]:!mt-1.5 [&_p]:!my-0 [&_h1]:!m-0 [&_h1]:!font-heading [&_h1]:!text-[15px] [&_h1]:!leading-6 [&_h1]:!font-semibold [&>:is(h2,h3):first-child]:!font-heading [&>:is(h2,h3):first-child]:!text-[15px] [&>:is(h2,h3):first-child]:!font-semibold [&_:is(h2,h3,h4,h5,h6)]:!mb-0 [&_:is(h2,h3,h4,h5,h6)]:!mt-2.5 [&_:is(h2,h3,h4,h5,h6)]:!text-[12.5px] [&_:is(h2,h3,h4,h5,h6)]:!leading-5 [&_:is(h2,h3,h4,h5,h6)]:!font-medium [&_:is(h2,h3,h4,h5,h6)]:text-foreground [&_ol]:!mt-0.5 [&_ol]:!mb-0 [&_ol]:!list-outside [&_ol]:!pl-5 [&_ul]:!mt-0.5 [&_ul]:!mb-0 [&_ul]:!list-outside [&_ul]:!pl-5 [&_li]:!my-[3px] [&_li]:!py-0 [&_li>p]:inline [&_code]:!text-[11.5px]';
const GUIDANCE_HEADING = 'mt-2.5 text-[12.5px] leading-5 font-medium text-foreground';

/** Where the plan lives, short; the full path is on hover. */
function planFileName(path: string) {
  const parts = path.split(/[\\/]/u).filter(Boolean);
  return parts.slice(-2).join('/');
}

/** A plan's own "Steps" heading; the preview drops it (the full plan keeps it). */
const STEPS_HEADING = /^#{2,6}[ \t]+steps?[ \t]*:?[ \t]*(?:\r?\n|$)/imu;

/** The payload's guidance when the markdown does not already carry it. */
function PlanGuidance({ plan }: { plan: PlanExit | undefined }) {
  const sections = planSections(plan?.plan_content);
  const recommendation = sections.hasRecommendation ? undefined : plan?.recommended_mode;
  const risks = sections.hasRisks ? undefined : plan?.risk_notes?.trim();
  if (!recommendation && !risks) return null;
  return (
    <div className="text-[12.5px] leading-[1.6] text-foreground/90" data-slot="plan-guidance">
      {recommendation ? (
        <section>
          <h3 className={GUIDANCE_HEADING}>Execution recommendation</h3>
          <p>{planModeLabel(recommendation)}</p>
        </section>
      ) : null}
      {risks ? (
        <section>
          <h3 className={GUIDANCE_HEADING}>Risks</h3>
          <p className="whitespace-pre-line">{risks}</p>
        </section>
      ) : null}
    </div>
  );
}

function missingPlanText(plan: PlanExit | undefined) {
  if (plan?.plan_content_status === 'unavailable')
    return 'The saved plan could not be loaded. Request changes, or leave Plan mode without executing.';
  if (plan?.plan_content_status === 'complete' || plan?.plan_content_status === 'truncated')
    return 'The plan is empty.';
  return 'The agent is still writing the plan.';
}

function footerText(plan: PlanExit | undefined) {
  // Only counts add anything here: "Plan truncated" by Execute already says the rest.
  if (plan?.plan_content_status === 'truncated') {
    const shown = plan.plan_content_included_chars;
    const total = plan.plan_content_chars;
    if (shown !== undefined && total !== undefined)
      return `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} characters`;
  }
  return planOutline(plan?.plan_content, plan ?? {});
}

/**
 * The plan at a glance: the first lines with a fade, what it contains, and
 * Open plan (O) beside the conversation. Without a place to open it, O shows
 * all of it here.
 */
function PlanPreview({
  interaction,
  artifact,
  onOpenArtifact,
  keys = true,
  className,
}: {
  interaction: PendingInteraction;
  artifact?: Artifact;
  onOpenArtifact?: (artifact: Artifact) => void;
  /** The card's O key; an answered row's preview has no card keys. */
  keys?: boolean;
  className?: string;
}) {
  const plan = interaction.payload?.plan_exit;
  const content = plan?.plan_content?.trim();
  const [expanded, setExpanded] = useAttentionDraft(`${interaction.id}:plan-expanded`, false);
  // The glance goes from the summary straight to the numbered steps, as the spec draws.
  const glance = expanded ? content : content?.replace(STEPS_HEADING, '');
  const [overflowing, setOverflowing] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const clip = clipRef.current;
    const body = bodyRef.current;
    if (!clip || !body || expanded) return;
    const measure = () => setOverflowing(body.scrollHeight > clip.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [expanded, content]);
  const opens = Boolean(artifact && onOpenArtifact);
  const toggles = Boolean(content) && !opens && (overflowing || expanded);
  const clipped = !expanded && overflowing;
  const footer = footerText(plan);
  return (
    <AskSection
      className={cn('overflow-hidden rounded-lg border border-border bg-background', className)}
      data-slot="plan-preview"
    >
      <div
        className={cn(
          'px-3.5 pt-2.5',
          expanded
            ? 'clio-scrollbar max-h-[min(28rem,50dvh)] overflow-auto pb-2.5'
            : 'max-h-[118px] overflow-hidden pb-2.5',
          clipped && '[mask-image:linear-gradient(#000_55%,transparent)]',
        )}
        data-plan-clipped={clipped || undefined}
        ref={clipRef}
        tabIndex={expanded ? 0 : undefined}
      >
        <div ref={bodyRef}>
          {content ? (
            <MessageResponse className={PLAN_MARKDOWN}>{glance}</MessageResponse>
          ) : (
            <div className="grid gap-1 text-[12.5px] leading-[1.6]">
              {plan?.summary ? <p className="text-foreground/90">{plan.summary}</p> : null}
              <p className="text-muted-foreground" title={plan?.plan_content_error}>
                {missingPlanText(plan)}
              </p>
            </div>
          )}
          <PlanGuidance plan={plan} />
        </div>
      </div>
      {footer || opens || toggles ? (
        <div
          className="flex h-[34px] min-w-0 items-center gap-2.5 border-t border-border pr-1.5 pl-3 text-[11.5px] whitespace-nowrap text-muted-foreground"
          data-slot="plan-preview-footer"
        >
          <span className="min-w-0 truncate" title={footer}>
            {footer}
          </span>
          {!keys && content ? (
            // The row's hover Copy can't be reached by touch or on a phone; the footer carries it there.
            <span className="ml-auto hidden shrink-0 pointer-coarse:inline-flex max-sm:inline-flex">
              <CopyAction label="Copy plan" value={content} />
            </span>
          ) : null}
          {opens || toggles ? (
            <AskButton
              {...(keys ? askKeyAttributes(['o']) : {})}
              aria-expanded={opens ? undefined : expanded}
              className={cn(
                'h-6 px-2 text-[12px]',
                keys || !content ? 'ml-auto' : 'ml-auto pointer-coarse:ml-0 max-sm:ml-0',
              )}
              onClick={() =>
                opens && artifact ? onOpenArtifact?.(artifact) : setExpanded((value) => !value)
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {opens ? <PanelRightIcon aria-hidden="true" className="size-3.5" /> : null}
                {opens ? 'Open plan' : expanded ? 'Show less' : 'Show all'}
                {keys ? <AskKeyChip askKey="o" /> : null}
              </span>
            </AskButton>
          ) : null}
        </div>
      ) : null}
    </AskSection>
  );
}

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

/**
 * The plan decision folded into its activity row: the chevron shows the plan
 * that was decided under it; hover copies it or opens it in the right pocket.
 */
function AnsweredPlan({
  artifact,
  interaction,
  onOpenArtifact,
}: {
  artifact?: Artifact;
  interaction: PendingInteraction;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const [shown, setShown] = useAttentionDraft(`${interaction.id}:plan-shown`, false);
  const opens = artifact && onOpenArtifact ? artifact : undefined;
  const content = interaction.payload?.plan_exit?.plan_content?.trim();
  return (
    <div
      className="min-w-0"
      data-interaction-kind="plan_exit"
      id={pendingInteractionDomId(interaction.id)}
    >
      <PlanDecision
        actions={
          content || opens ? (
            <>
              {content ? (
                <CopyAction label="Copy plan" value={content} />
              ) : (
                <span className="w-[22px]" />
              )}
              {opens ? (
                <NamedTooltip label="Open plan">
                  <Button
                    aria-label="Open plan"
                    className="size-[22px] rounded-[5px] p-0 text-muted-foreground hover:bg-hover hover:text-foreground [&_svg]:size-[13px]"
                    data-activity-action="open"
                    onClick={() => onOpenArtifact?.(opens)}
                    variant="ghost"
                  >
                    <PanelRightIcon aria-hidden="true" />
                  </Button>
                </NamedTooltip>
              ) : null}
            </>
          ) : null
        }
        interaction={interaction}
        onOpenChange={content ? setShown : undefined}
        open={content ? shown : undefined}
      />
      {shown && content ? (
        <ActivityBody framed={false} label="Plan">
          <PlanPreview
            artifact={opens}
            interaction={interaction}
            keys={false}
            onOpenArtifact={onOpenArtifact}
          />
        </ActivityBody>
      ) : null}
    </div>
  );
}

/** The plan card: preview with a fade, Open plan, then Plan ready and the decision. */
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
  if (interaction.status !== 'pending')
    return (
      <AnsweredPlan artifact={artifact} interaction={interaction} onOpenArtifact={onOpenArtifact} />
    );
  const plan = interaction.payload?.plan_exit;
  const actions = interaction.actions ?? [];
  const canAnswer = actions.includes('answer');
  const file = plan?.plan_file;
  return (
    <AskCard
      data-interaction-kind="plan_exit"
      icon={NotebookTextIcon}
      id={pendingInteractionDomId(interaction.id)}
      kind="plan"
      meta={
        file ? (
          <span title={file}>{planFileName(file)}</span>
        ) : plan?.summary ? (
          <span title={plan.summary}>{plan.summary}</span>
        ) : undefined
      }
      metaMono={Boolean(file)}
      owner={
        showOwner ? (
          <OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show />
        ) : undefined
      }
      title="Plan"
      titleText={interaction.title}
    >
      <PlanPreview artifact={artifact} interaction={interaction} onOpenArtifact={onOpenArtifact} />
      <AskError error={responseError} />
      {canAnswer ? (
        <PlanDecisionControls
          disabled={disabled}
          interaction={interaction}
          onResponse={onResponse}
        />
      ) : (
        <AskSection className="mt-2.5 text-[12px] text-muted-foreground">
          Plan controls are not available yet.
        </AskSection>
      )}
    </AskCard>
  );
}
