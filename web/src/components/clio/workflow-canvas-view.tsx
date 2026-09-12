import type { SubagentRun, ToolInvocation } from '@clio/core/v3';
import { Clock3Icon, WorkflowIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { ClioWorkflowExecutionGraph } from './workflow-graph';
import { workflowDescriptor } from './workflow-tool-presentation';

/** Durable canvas view for one recorded workflow invocation. */
export function ClioWorkflowCanvasView({
  onOpenSubagent,
  subagents,
  tool,
}: {
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: readonly SubagentRun[];
  tool: ToolInvocation;
}) {
  const descriptor = workflowDescriptor(tool);
  if (!descriptor) {
    return <p className="p-4 text-sm text-muted-foreground">Workflow definition unavailable.</p>;
  }
  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 sm:p-4">
      <header className="mb-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
              <WorkflowIcon aria-hidden="true" className="size-4" /> Workflow run
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{descriptor.label}</h2>
            {descriptor.request ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {descriptor.request}
              </p>
            ) : null}
          </div>
          <ClioStatus label={tool.state.replaceAll('_', ' ')} value={tool.state} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {descriptor.steps.length} ordered {descriptor.steps.length === 1 ? 'step' : 'steps'}
          </Badge>
          {tool.duration_ms !== undefined ? (
            <Badge className="gap-1.5" variant="outline">
              <Clock3Icon aria-hidden="true" className="size-3.5" />
              {(tool.duration_ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} s
            </Badge>
          ) : null}
          <span className="font-mono text-[11px] text-muted-foreground">{tool.id}</span>
        </div>
      </header>
      <ClioWorkflowExecutionGraph
        onOpenSubagent={onOpenSubagent}
        subagents={subagents}
        tool={tool}
      />
    </div>
  );
}
