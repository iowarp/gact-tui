import type { SubagentRun, Task, ToolInvocation } from '@clio/core/v3';
import { memo, useEffect, useState } from 'react';
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

const THINKING_ICON = <BrainIcon aria-hidden="true" />;
const WAITING_STATUS = (
  <StatusIndicator tone="running" label="Waiting for response" display="column" mark="glyph" />
);

/**
 * The live row while the model has said nothing yet: "Thinking…", its time, a spinner.
 * Only the elapsed readout follows the clock, so the once-a-second tick re-renders a
 * text leaf rather than the row, its tooltip and status.
 */
const ResponseWait = memo(function ResponseWait() {
  const [started] = useState(() => Date.now());
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 1_000);
    return () => window.clearTimeout(timer);
  }, []);
  // Keep quick handoffs quiet while making sustained waits continuously visible. The quiet
  // second still reserves the row's height so revealing it doesn't shift a latest-pinned
  // transcript (and whatever the pointer was over) a row upward.
  if (!revealed)
    return (
      <div
        aria-hidden="true"
        data-slot="turn-response-wait-reserve"
        style={{ visibility: 'hidden' }}
      >
        <ActivityRow icon={THINKING_ICON} name="Thinking…" elapsed="0s" status={WAITING_STATUS} />
      </div>
    );
  return (
    <div role="status" data-slot="turn-response-wait">
      <ActivityRow
        icon={THINKING_ICON}
        name="Thinking…"
        elapsed={<ResponseWaitElapsed started={started} />}
        status={WAITING_STATUS}
      />
    </div>
  );
});

function ResponseWaitElapsed({ started }: { started: number }) {
  const now = useNow(true);
  // Revealed only after a full second, so a clock reading from just before reveal still says 1s.
  return `${Math.max(1, Math.floor((now - started) / 1000))}s`;
}
