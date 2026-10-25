import type { PendingInteraction, ToolInvocation } from '@clio/core/v3';
import { flowToolDescriptor } from './flow-tool-presentation';
import { questionWorkStatus } from './question-tool-presentation';
import { getToolStatus } from './tool-presentation';
import type { WorkKind } from './work-kind';

export interface WorkPresentation {
  kind: WorkKind;
  status: string;
}

/** Preserve the distinction between posting work and that work being finished. */
export function toolWorkPresentation(
  tool: ToolInvocation,
  interactions?: readonly PendingInteraction[],
): WorkPresentation {
  const status = getToolStatus(tool);
  const pendingSnapshot = tool.presentation?.blocks.some(
    (block) => block.result_kind === 'snapshot' && block.status === 'pending',
  );
  return {
    kind:
      tool.name === 'ask_user'
        ? 'question'
        : tool.name === 'subagent'
          ? 'agent'
          : flowToolDescriptor(tool)
            ? 'workflow'
            : 'tool',
    status: ['failed', 'denied', 'cancelled', 'degraded', 'unknown'].includes(status)
      ? status
      : (questionWorkStatus(tool, interactions) ?? (pendingSnapshot ? 'pending' : status)),
  };
}
