import type { Message, SubagentRun, Task, ToolInvocation } from '@clio/core/v3';
import { useMemo } from 'react';
import {
  conversationTurnPresentation,
  type ConversationTurnPresentation,
} from './conversation-turn-model';
import { subagentsForTool } from './subagent-tool-link';

export interface ConversationTurnView extends ConversationTurnPresentation {
  /** Child runs already shown beside their spawning tool, so the residual lane can skip them. */
  linkedSubagentIds: ReadonlySet<string>;
}

/**
 * Memoized turn projection for one message row.
 *
 * This app configures no React Compiler, so the projection is memoized by hand:
 * a view-mode toggle or a virtual-row reposition re-renders a row without
 * changing its transcript, and rebuilding the model for every message on screen
 * is the difference between a smooth and a janky long conversation. It lives in
 * its own module so the memoized values are plain parameters rather than fields
 * of a rest object the row also spreads onward.
 */
export function useConversationTurn(
  message: Message,
  tools: Record<string, ToolInvocation>,
  tasks: Record<string, Task>,
  subagents: Record<string, SubagentRun>,
): ConversationTurnView {
  const turn = useMemo(
    () => conversationTurnPresentation(message, tools, tasks),
    [message, tasks, tools],
  );
  const linkedSubagentIds = useMemo(
    () =>
      new Set(
        turn.iterations.flatMap((iteration) =>
          iteration.tools.flatMap((tool) =>
            subagentsForTool(tool, subagents).map((subagent) => subagent.id),
          ),
        ),
      ),
    [subagents, turn],
  );
  return { ...turn, linkedSubagentIds };
}
