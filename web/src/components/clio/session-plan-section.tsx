import type { SessionWork } from '@clio/core/v3';
import { FileTextIcon } from 'lucide-react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { planOriginLabel, planStatusLabel } from '@/lib/plan-status';
import { SessionSummaryRow } from './session-summary-row';
import { t } from '@lingui/core/macro';

type SessionPlan = NonNullable<SessionWork['plan']>;

function sessionPlanName(plan: SessionPlan): string {
  return plan.path.split(/[\\/]/).pop() || plan.path;
}

/**
 * The session plan as the agent keeps it, read only: where it came from, its status and file,
 * then the Markdown. The file opens in a workbench tab, where it can be read and cited.
 */
export function SessionPlanBody({
  plan,
  onOpen,
  preview = true,
}: {
  plan: SessionPlan;
  /** Open the plan file in a workbench tab. */
  onOpen?: (path: string) => void;
  /** Show the plan's Markdown under its row. */
  preview?: boolean;
}) {
  const name = sessionPlanName(plan);
  return (
    <div className="flex min-w-0 flex-col gap-1" data-slot="session-plan">
      <SessionSummaryRow
        icon={<FileTextIcon />}
        label={name}
        metadata={planStatusLabel(plan.status)}
        onOpen={onOpen && plan.path ? () => onOpen(plan.path) : undefined}
        title={plan.path}
      />
      <p className="px-1 text-xs text-muted-foreground" data-slot="session-plan-origin">
        {planOriginLabel(plan.status)}
      </p>
      {preview && plan.text ? (
        <div className="min-w-0 px-1 text-sm">
          <MarkdownText mode="static">{plan.text}</MarkdownText>
        </div>
      ) : null}
      {preview && !plan.text ? (
        <p className="px-1 text-xs text-muted-foreground">{t`The plan file is empty.`}</p>
      ) : null}
    </div>
  );
}
