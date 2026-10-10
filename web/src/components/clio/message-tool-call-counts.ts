import type { Message, ToolInvocation } from '@clio/core/v3';
import { getToolStatus } from './tool-presentation';

/** Count each recorded call once, using its semantic outcome rather than transport success. */
export function messageToolCallCounts(
  message: Message,
  tools: Record<string, ToolInvocation>,
): { toolCount: number; failedToolCount: number } {
  const ids = new Set(
    message.blocks.flatMap((block) => (block.type === 'tool' ? [block.tool_id] : [])),
  );
  return {
    toolCount: ids.size,
    failedToolCount: [...ids].filter((id) => tools[id] && getToolStatus(tools[id]) === 'failed')
      .length,
  };
}
