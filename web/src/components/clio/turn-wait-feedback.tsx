import type { SubagentRun, Task, ToolInvocation } from '@clio/core/v3';
import { useState } from 'react';
import { useReducedMotionConfig } from 'motion/react';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { useNow } from '@/hooks/use-now';
import { currentTurnAssistantMessages } from '@/lib/current-turn-messages';
import type { TurnPreparationProps } from './turn-preparation';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';

interface TurnWaitFeedbackProps extends TurnPreparationProps {
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, Task>;
  subagents: Record<string, SubagentRun>;
}

/** Keep quiet model waits visible after startup, without inventing provider activity. */
export function ClioTurnWaitFeedback({
  messages,
  activeTurnId,
  activeTurnResponded,
  sessionState,
  dependencies = [],
  tools,
  tasks,
  subagents,
}: TurnWaitFeedbackProps) {
  if (sessionState !== 'running' && sessionState !== 'queued') return null;
  const current = currentTurnAssistantMessages(messages, activeTurnId);
  const hasContent = current.some((message) =>
    message.blocks.some((block) =>
      block.type === 'text' || block.type === 'reasoning' ? block.text.trim().length > 0 : true,
    ),
  );
  if (!activeTurnResponded && !hasContent) return null;
  const hasVisibleWork = current.some((message) =>
    message.blocks.some((block) => {
      if (block.type === 'text' || block.type === 'reasoning')
        return block.streaming && block.text.trim().length > 0;
      if (block.type === 'tool')
        return ['pending', 'running'].includes(tools[block.tool_id]?.state ?? '');
      if (block.type === 'task')
        return ['queued', 'running'].includes(tasks[block.task_id]?.state ?? '');
      if (block.type === 'subagent')
        return ['queued', 'running', 'waiting_user', 'waiting_permission'].includes(
          subagents[block.subagent_id]?.state ?? '',
        );
      return false;
    }),
  );
  if (hasVisibleWork) return null;
  if (dependencies.some((item) => ['running', 'retrying'].includes(item.state)))
    return (
      <div className="py-3 text-sm text-muted-foreground" role="status">
        <ClioInfrastructurePreparation dependencies={dependencies} followUp />
      </div>
    );
  return <ResponseWait key={activeTurnId ?? current.at(-1)?.id} />;
}

function ResponseWait() {
  const [started] = useState(() => Date.now());
  const now = useNow(true);
  const reducedMotion = useReducedMotionConfig();
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  // Keep quick handoffs quiet while making sustained waits continuously visible.
  if (seconds < 1) return null;
  return (
    <div
      className="flex min-h-7 items-center gap-2 py-3 text-sm text-muted-foreground"
      data-slot="turn-response-wait"
      role="status"
    >
      {reducedMotion ? (
        <span className="font-medium">Waiting for response</span>
      ) : (
        <Shimmer as="span" className="font-medium" duration={1.5}>
          Waiting for response
        </Shimmer>
      )}
      <span aria-hidden="true" className="font-mono text-xs tabular-nums">
        {seconds}s
      </span>
    </div>
  );
}
