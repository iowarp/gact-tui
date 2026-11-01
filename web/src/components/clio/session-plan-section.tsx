import type { SessionWork } from '@clio/core/v3';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { planStatusLabel } from '@/lib/plan-status';

/** The session plan as the agent keeps it: its status, file and Markdown. */
export function SessionPlanBody({ plan }: { plan: NonNullable<SessionWork['plan']> }) {
  const name = plan.path.split(/[\\/]/).pop() ?? plan.path;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-slot="session-plan">
      <p className="text-xs text-muted-foreground" title={plan.path}>
        {planStatusLabel(plan.status)} · {name}
      </p>
      <div className="min-w-0 text-sm">
        <MarkdownText mode="static">{plan.text}</MarkdownText>
      </div>
    </div>
  );
}
