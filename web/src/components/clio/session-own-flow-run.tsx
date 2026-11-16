import { sessionOwnFlow } from '@clio/core/v3';
import { useMessageAssignment } from '@/hooks/use-flow-run';
import { useLiveStore } from '@/store/live-store';
import { FlowRunCard } from './flow-run-card';

/**
 * Under a person's message in a session whose own work is a flow (a script's
 * `run_flow`): that message's run of the flow, as the same card a `run_flow` call
 * shows in the conversation that started it: the railroad, its nodes and the result.
 */
export function SessionOwnFlowRun({
  sessionId,
  messageId,
}: {
  sessionId: string;
  messageId: string;
}) {
  const session = useLiveStore((state) => state.entities.sessions[sessionId]);
  const flow = sessionOwnFlow(session);
  // Every other conversation renders nothing and asks the service nothing.
  return flow ? <OwnFlowRun flow={flow} messageId={messageId} sessionId={sessionId} /> : null;
}

function OwnFlowRun({
  flow,
  sessionId,
  messageId,
}: {
  flow: { id: string; options: Record<string, unknown> };
  sessionId: string;
  messageId: string;
}) {
  const assignment = useMessageAssignment(sessionId, messageId, true);
  if (!assignment.data) return null;
  return (
    <div className="mt-3 min-w-0" data-slot="session-own-flow-run">
      <FlowRunCard
        flow={{
          flow: flow.id,
          label: flow.id,
          handle: assignment.data,
          args: { options: flow.options },
        }}
        sessionId={sessionId}
      />
    </div>
  );
}
