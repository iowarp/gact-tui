import type { SessionWork } from '@clio/core/v3';
import { FileTextIcon } from 'lucide-react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { planOriginLabel, planStatusLabel } from '@/lib/plan-status';
import { cn } from '@/lib/utils';
import { SessionSummaryRow } from './session-summary-row';
import { t } from '@lingui/core/macro';

type SessionPlan = NonNullable<SessionWork['plan']>;

function sessionPlanName(plan: SessionPlan): string {
  return plan.path.split(/[\\/]/).pop() || plan.path;
}

/**
 * The session plan document, read only: where it came from, its status and file, then its
 * Markdown. The plan opens in a workbench tab, where it can be read and cited.
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
  const origin = planOriginLabel(plan);
  return (
    <div className="flex min-w-0 flex-col gap-1" data-slot="session-plan">
      <SessionSummaryRow
        icon={<FileTextIcon />}
        label={name}
        metadata={planStatusLabel(plan.status)}
        onOpen={onOpen && plan.path ? onOpen : undefined}
        title={plan.path}
      />
      {origin ? (
        <p className="px-1 text-xs text-muted-foreground" data-slot="session-plan-origin">
          {origin}
        </p>
      ) : null}
      {preview ? <PlanContent className="px-1" text={plan.text} /> : null}
    </div>
  );
}

/** The plan document as written, rendered read only. Never parsed into steps. */
export function PlanContent({ text, className }: { text: string; className?: string }) {
  if (!text.trim())
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>{t`The plan file is empty.`}</p>
    );
  return (
    <div className={cn('min-w-0 text-sm', className)} data-slot="plan-content">
      <MarkdownText mode="static">{text}</MarkdownText>
    </div>
  );
}
