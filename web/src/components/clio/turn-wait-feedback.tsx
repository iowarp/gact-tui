import type { SubagentRun, Task, ToolInvocation } from '@clio/core/v3';
import { useState } from 'react';
import { BrainIcon, ServerIcon } from 'lucide-react';
import { useNow } from '@/hooks/use-now';
import { currentTurnAssistantMessages } from '@/lib/current-turn-messages';
import type { TurnPreparationProps } from './turn-preparation';
import { ActivityRow } from './activity-row';
import { infrastructurePreparationLabel } from './infrastructure-preparation-label';
import { StatusIndicator } from './primitives/status-indicator';

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
      <div role="status" data-slot="turn-response-wait">
        <ActivityRow
          icon={<ServerIcon aria-hidden="true" />}
          name={infrastructurePreparationLabel(dependencies, true)}
          status={
            <StatusIndicator tone="running" label="Preparing" display="column" mark="glyph" />
          }
        />
      </div>
    );
  return <ResponseWait key={activeTurnId ?? current.at(-1)?.id} />;
}

/** The live row while the model has said nothing yet: "Thinking…", its time, a spinner. */
function ResponseWait() {
  const [started] = useState(() => Date.now());
  const now = useNow(true);
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  // Keep quick handoffs quiet while making sustained waits continuously visible.
  if (seconds < 1) return null;
  return (
    <div role="status" data-slot="turn-response-wait">
      <ActivityRow
        icon={<BrainIcon aria-hidden="true" />}
        name="Thinking…"
        elapsed={`${seconds}s`}
        status={
          <StatusIndicator
            tone="running"
            label="Waiting for response"
            display="column"
            mark="glyph"
          />
        }
      />
    </div>
  );
}
