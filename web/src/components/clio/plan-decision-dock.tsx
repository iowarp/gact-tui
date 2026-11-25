import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { NotebookTextIcon, PanelRightIcon } from 'lucide-react';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { planDocumentTitle } from '@/lib/plan-status';
import { AskCard, AskError, AskSection } from './ask-card';
import { plainInlineCode } from '@/lib/inline-code';
import { openPlanTab } from '@/lib/plan-tab';
import { PlanDecisionControls } from './plan-decision-controls';
import { useInlinePlanDecisionInView } from './plan-decision-view';
import { IconButton } from './primitives/icon-button';
import { t } from '@lingui/core/macro';

type Respond = (
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
) => Promise<void>;

/**
 * The plan decision where the person is: over the composer while the plan card's own decision
 * is out of view, and at the top of the Plan tab. The same shared controls as the plan card,
 * sharing its draft (mode, note, clear context), so whichever answers, the others follow.
 */
export function PlanDecisionDock({
  interaction,
  onResponse,
  onOpenPlan,
  placement,
}: {
  interaction: PendingInteraction;
  onResponse?: Respond;
  /** Show the plan itself (the Plan tab); omitted where the plan is already on screen. */
  onOpenPlan?: () => void;
  placement: 'composer' | 'tab';
}) {
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState<Error>();
  const plan = interaction.payload?.plan_exit;
  const named = planDocumentTitle(plan?.plan_content);
  const respond: Respond = async (target, response) => {
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
    <TooltipProvider>
      <AskCard
        className={
          placement === 'composer'
            ? 'pointer-events-auto relative z-10 mx-auto mb-1.5 w-full max-w-4xl pb-2.5'
            : 'pb-2.5'
        }
        data-interaction-kind="plan_exit"
        data-plan-decision-placement={placement}
        data-slot="plan-decision-dock"
        headerActions={
          onOpenPlan ? (
            <IconButton
              icon={<PanelRightIcon aria-hidden="true" />}
              label={t`Open plan`}
              onClick={onOpenPlan}
              size="sm"
              type="button"
            />
          ) : undefined
        }
        icon={NotebookTextIcon}
        kind="plan"
        meta={
          named && placement === 'composer' ? (
            <span title={plan?.plan_file}>{plainInlineCode(named)}</span>
          ) : undefined
        }
        title={placement === 'composer' ? t`Plan waiting for your decision` : t`Your decision`}
        titleText={interaction.title}
      >
        <AskError error={responseError} />
        {onResponse ? (
          <PlanDecisionControls
            disabled={responding}
            divided={false}
            interaction={interaction}
            onResponse={respond}
          />
        ) : (
          <AskSection className="mt-1 text-meta text-muted-foreground">
            {t`Plan controls are not available yet.`}
          </AskSection>
        )}
      </AskCard>
    </TooltipProvider>
  );
}

/** The plan card's decision over the composer, only while the card's own row is out of view. */
export function ComposerPlanDecision({
  interaction,
  onResponse,
}: {
  interaction: PendingInteraction;
  onResponse: Respond;
}) {
  const inView = useInlinePlanDecisionInView(interaction.id);
  if (inView) return null;
  return (
    <PlanDecisionDock
      interaction={interaction}
      onOpenPlan={() => openPlanTab(interaction.owner_session_id)}
      onResponse={onResponse}
      placement="composer"
    />
  );
}
