import type { Artifact, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NotebookTextIcon, PanelRightIcon } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AskButton, AskCard, AskError, AskKeyChip, AskSection } from './ask-card';
import { askKeyAttributes } from './ask-card-keys';
import { useAttentionDraft } from './attention-drafts';
import { focusLost, isEmptyComposer, pendingInteractionDomId } from './interaction-control';
import { OwnerAttribution } from './pending-interaction-notices';
import { PlanDecision, PlanDecisionControls } from './plan-decision-controls';
import { planArtifact } from './plan-artifact';
import { planModeLabel } from './plan-mode-label';
import { planOutline, planSections } from './plan-outline';
import { NamedTooltip } from './primitives/icon-button';
import { ActivityBody } from './activity-row';
import { CopyAction } from './tool-compact-row';
import { formatNumber } from '@/lib/locale-format';
import { ph, t } from '@lingui/core/macro';

type PlanExit = NonNullable<NonNullable<PendingInteraction['payload']>['plan_exit']>;

// One scale: the plan's own title at 15px, section headings 12.5px medium, body 12.5px.
// `[&>*+*]` would compile to a universal sibling selector that restyles whole lists on any insert.
const PLAN_MARKDOWN =
  'min-w-0 text-menu leading-[1.55] text-foreground/90 [overflow-wrap:anywhere] [&>:where(:not(:first-child))]:!mt-1.5 [&_p]:!my-0 [&_h1]:!m-0 [&_h1]:!font-heading [&_h1]:!text-h3 [&_h1]:!leading-6 [&_h1]:!font-semibold [&>:is(h2,h3):first-child]:!font-heading [&>:is(h2,h3):first-child]:!text-h3 [&>:is(h2,h3):first-child]:!font-semibold [&_:is(h2,h3,h4,h5,h6)]:!mb-0 [&_:is(h2,h3,h4,h5,h6)]:!mt-2.5 [&_:is(h2,h3,h4,h5,h6)]:!text-menu [&_:is(h2,h3,h4,h5,h6)]:!leading-5 [&_:is(h2,h3,h4,h5,h6)]:!font-medium [&_:is(h2,h3,h4,h5,h6)]:text-foreground [&_ol]:!mt-0.5 [&_ol]:!mb-0 [&_ol]:!list-outside [&_ol]:!pl-5 [&_ul]:!mt-0.5 [&_ul]:!mb-0 [&_ul]:!list-outside [&_ul]:!pl-5 [&_li]:!my-[3px] [&_li]:!py-0 [&_li>p]:inline [&_code]:!text-label';
const GUIDANCE_HEADING = 'mt-2.5 text-menu leading-5 font-medium text-foreground';

/** Where the plan lives, short; the full path is on hover. Storage ids are not names. */
function planFileName(path: string) {
  const parts = path
    .split(/[\\/]/u)
    .filter((part) => part && !/^(?:(?:fld|res)_)?[0-9a-f]{16,}$/iu.test(part));
  return parts.slice(-2).join('/') || path;
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
    <div className="text-menu leading-[1.6] text-foreground/90" data-slot="plan-guidance">
      {recommendation ? (
        <section>
          <h3 className={GUIDANCE_HEADING}>{t`Execution recommendation`}</h3>
          <p>{planModeLabel(recommendation)}</p>
        </section>
      ) : null}
      {risks ? (
        <section>
          <h3 className={GUIDANCE_HEADING}>{t`Risks`}</h3>
          <p className="whitespace-pre-line">{risks}</p>
        </section>
      ) : null}
    </div>
  );
}

function missingPlanText(plan: PlanExit | undefined) {
  if (plan?.plan_content_status === 'unavailable')
    return t`The saved plan could not be loaded. Request changes, or leave Plan mode without executing.`;
  if (plan?.plan_content_status === 'complete' || plan?.plan_content_status === 'truncated')
    return t`The plan is empty.`;
  return t`The agent is still writing the plan.`;
}

function footerText(plan: PlanExit | undefined) {
  // Only counts add anything here: "Plan truncated" by Execute already says the rest.
  if (plan?.plan_content_status === 'truncated') {
    const shown = plan.plan_content_included_chars;
    const total = plan.plan_content_chars;
    if (shown !== undefined && total !== undefined)
      return t`Showing ${ph({ shown: formatNumber(shown) })} of ${ph({ total: formatNumber(total) })} characters`;
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
  // Under a tight height cap the reading area can get less than a line: show none of it, not a sliver.
  const [cramped, setCramped] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const clip = clipRef.current;
    const body = bodyRef.current;
    if (!clip || !body || expanded) return;
    const measure = () => {
      setOverflowing(body.scrollHeight > clip.clientHeight + 1);
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setCramped(clip.clientHeight > 0 && clip.clientHeight < 2.5 * rem);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    observer.observe(clip);
    return () => observer.disconnect();
  }, [expanded, content]);
  const opens = Boolean(artifact && onOpenArtifact);
  const toggles = Boolean(content) && !opens && (overflowing || expanded);
  const clipped = !expanded && overflowing;
  const hidden = !expanded && cramped;
  const footer = footerText(plan);
  return (
    <AskSection
      // Under the card's height cap the reading area gives up height; the footer stays whole.
      className={cn(
        'flex min-h-[36px] flex-col overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
      data-slot="plan-preview"
    >
      <div
        className={cn(
          // The padding sits on the body, so the reading area can give up all of its height.
          'min-h-0',
          expanded
            ? 'clio-scrollbar max-h-[min(28rem,50dvh)] overflow-auto'
            : 'max-h-[118px] overflow-hidden',
          clipped && '[mask-image:linear-gradient(#000_55%,transparent)]',
          hidden && 'invisible',
        )}
        data-plan-clipped={clipped || undefined}
        data-plan-cramped={hidden || undefined}
        ref={clipRef}
        tabIndex={expanded ? 0 : undefined}
      >
        <div className="px-3.5 py-2.5" ref={bodyRef}>
          {content ? (
            <MessageResponse className={PLAN_MARKDOWN}>{glance}</MessageResponse>
          ) : (
            <div className="grid gap-1 text-menu leading-[1.6]">
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
          // rem, so the footer grows with its button at larger interface sizes. When the summary
          // can't keep a readable width beside the button, the button takes its own line.
          className={cn(
            'flex min-h-[2.125rem] min-w-0 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-border py-[0.3125rem] pr-1.5 pl-3 text-label whitespace-nowrap text-muted-foreground',
            !hidden && 'border-t',
          )}
          data-slot="plan-preview-footer"
        >
          <span className={cn('min-w-0 truncate', footer && 'flex-[1_1_4.5rem]')} title={footer}>
            {footer}
          </span>
          {!keys && content ? (
            // The row's hover Copy can't be reached by touch or on a phone; the footer carries it there.
            <span className="ml-auto hidden shrink-0 pointer-coarse:inline-flex max-sm:inline-flex">
              <CopyAction label={t`Copy plan`} value={content} />
            </span>
          ) : null}
          {opens || toggles ? (
            <AskButton
              {...(keys ? askKeyAttributes(['o']) : {})}
              aria-expanded={opens ? undefined : expanded}
              className={cn(
                'h-6 px-2 text-meta',
                keys || !content ? 'ml-auto' : 'ml-auto pointer-coarse:ml-0 max-sm:ml-0',
              )}
              onClick={() =>
                opens && artifact ? onOpenArtifact?.(artifact) : setExpanded((value) => !value)
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {opens ? <PanelRightIcon aria-hidden="true" className="size-3.5" /> : null}
                {opens ? t`Open plan` : expanded ? t`Show less` : t`Show all`}
                {keys ? <AskKeyChip askKey="o" /> : null}
              </span>
            </AskButton>
          ) : null}
        </div>
      ) : null}
    </AskSection>
  );
}

function planCard(interactionId: string): HTMLElement | null {
  return (
    document
      .getElementById(pendingInteractionDomId(interactionId))
      ?.closest<HTMLElement>('[data-slot="ask-card"]') ?? null
  );
}

/** Plans that have already been offered focus in this page. */
const focusedPlans = new Set<string>();

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
  // The control that answered, so a failed answer hands focus back to it once
  // it is enabled again rather than leaving focus on the page.
  const answeredFrom = useRef<HTMLElement | null>(null);
  const artifact = planArtifact(interaction, artifacts);
  const pending = interaction.status === 'pending';
  useEffect(() => {
    // Like a docked card, a plan that arrives takes focus when nothing holds it
    // or the composer is empty; once per plan, so a remount never steals focus.
    if (!pending || focusedPlans.has(interaction.id)) return;
    focusedPlans.add(interaction.id);
    const active = document.activeElement;
    if (!focusLost(active) && !isEmptyComposer(active)) return;
    // Programmatic focus is not keyboard focus; Chromium would otherwise draw the focus edge.
    planCard(interaction.id)?.focus({ preventScroll: true, focusVisible: false });
  }, [interaction.id, pending]);
  useEffect(() => {
    if (responding || !responseError || !answeredFrom.current) return;
    const control = answeredFrom.current;
    answeredFrom.current = null;
    if (!focusLost()) return;
    const usable =
      control.isConnected && !(control instanceof HTMLButtonElement && control.disabled);
    (usable ? control : planCard(interaction.id))?.focus({ preventScroll: true });
  }, [interaction.id, responding, responseError]);
  const respond = async (target: PendingInteraction, response: PendingInteractionResponse) => {
    if (!onResponse || responding) return;
    const active = document.activeElement;
    answeredFrom.current =
      active instanceof HTMLElement && planCard(interaction.id)?.contains(active) ? active : null;
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
                <CopyAction label={t`Copy plan`} value={content} />
              ) : (
                <span className="w-[22px]" />
              )}
              {opens ? (
                <NamedTooltip label={t`Open plan`}>
                  <Button
                    aria-label={t`Open plan`}
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
        <ActivityBody framed={false} label={t`Plan`}>
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
      title={t`Plan`}
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
        <AskSection className="mt-2.5 text-meta text-muted-foreground">
          {t`Plan controls are not available yet.`}
        </AskSection>
      )}
    </AskCard>
  );
}
