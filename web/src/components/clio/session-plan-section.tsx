import type { SessionWork } from '@clio/core/v3';
import { FileTextIcon } from 'lucide-react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { planOriginLabel, planStatusLabel } from '@/lib/plan-status';
import { planBlocks, type PlanStepState } from '@/lib/plan-steps';
import { cn } from '@/lib/utils';
import { SessionSummaryRow } from './session-summary-row';
import { TodoStatusIcon } from './todo-list';
import { t } from '@lingui/core/macro';

type SessionPlan = NonNullable<SessionWork['plan']>;

function sessionPlanName(plan: SessionPlan): string {
  return plan.path.split(/[\\/]/).pop() || plan.path;
}

/**
 * The session plan as the agent keeps it, read only: where it came from, its status and file,
 * then its steps. The plan opens in a workbench tab, where it can be read and cited.
 */
export function SessionPlanBody({
  plan,
  onOpen,
  preview = true,
}: {
  plan: SessionPlan;
  /** Open the plan in a workbench tab. */
  onOpen?: () => void;
  /** Show the plan under its row. */
  preview?: boolean;
}) {
  const name = sessionPlanName(plan);
  return (
    <div className="flex min-w-0 flex-col gap-1" data-slot="session-plan">
      <SessionSummaryRow
        icon={<FileTextIcon />}
        label={name}
        metadata={planStatusLabel(plan.status)}
        onOpen={onOpen && plan.path ? onOpen : undefined}
        title={plan.path}
      />
      <p className="px-1 text-xs text-muted-foreground" data-slot="session-plan-origin">
        {planOriginLabel(plan.status)}
      </p>
      {preview ? <PlanContent className="px-1" text={plan.text} /> : null}
    </div>
  );
}

const STEP_ICON_STATE: Record<PlanStepState, string> = {
  closed: 'completed',
  active: 'in_progress',
  open: 'pending',
  dropped: 'pending',
};

function stepStateLabel(state: PlanStepState): string {
  if (state === 'closed') return t`Done`;
  if (state === 'active') return t`In progress`;
  if (state === 'dropped') return t`Dropped`;
  return t`Open`;
}

/**
 * The plan's text, read only: marked steps (`- [open] …`) as a checklist with each
 * step's state in words, the rest as Markdown.
 */
export function PlanContent({ text, className }: { text: string; className?: string }) {
  if (!text.trim())
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>{t`The plan file is empty.`}</p>
    );
  return (
    <div className={cn('flex min-w-0 flex-col gap-3 text-sm', className)} data-slot="plan-content">
      {planBlocks(text).map((block, index) =>
        block.kind === 'markdown' ? (
          <div className="min-w-0" key={index}>
            <MarkdownText mode="static">{block.text}</MarkdownText>
          </div>
        ) : (
          <ul
            aria-label={t`Plan steps`}
            className="flex list-none flex-col gap-1.5"
            data-slot="plan-steps"
            key={index}
          >
            {block.steps.map((step, stepIndex) => (
              <li
                className="flex min-w-0 items-start gap-2"
                data-step-state={step.state}
                key={`${stepIndex}:${step.text}`}
              >
                <TodoStatusIcon className="mt-0.5" state={STEP_ICON_STATE[step.state]} />
                <div
                  className={cn(
                    'min-w-0 flex-1 [&_p]:my-0',
                    step.state === 'dropped' && 'text-muted-foreground line-through',
                  )}
                >
                  <MarkdownText mode="static">{step.text}</MarkdownText>
                </div>
                <span className="shrink-0 pt-px text-xs text-muted-foreground">
                  {stepStateLabel(step.state)}
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
