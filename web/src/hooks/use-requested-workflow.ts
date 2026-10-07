import type { ToolInvocation } from '@clio/core/v3';
import { useEffect, useRef } from 'react';

/** Open a workflow deep link once its recorded tool invocation becomes available. */
export function useRequestedWorkflow(
  workflowId: string | null,
  tools: readonly ToolInvocation[],
  openWorkflow: (tool: ToolInvocation) => void,
) {
  const openedWorkflowId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!workflowId || openedWorkflowId.current === workflowId) return;
    const workflow = tools.find((tool) => tool.id === workflowId);
    if (!workflow || workflow.name !== 'run_workflow') return;
    openedWorkflowId.current = workflowId;
    openWorkflow(workflow);
  }, [openWorkflow, workflowId, tools]);
}
