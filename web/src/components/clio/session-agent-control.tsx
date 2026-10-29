import { emptyAgentDelta } from '@clio/core/v3';
import { usePluginChange } from '@/hooks/use-plugin-change';
import { useInstalledAgents } from '@/hooks/use-session-agent';
import { ConversationAgentControls } from './conversation-agent-controls';
import { PluginChangeDialog } from './plugin-change-dialog';

/**
 * The conversation's agent uses the draft's selector and Customize entry.
 * Switching a saved conversation keeps the existing plugin-change confirmation.
 */
export function SessionAgentControl({
  sessionId,
  agentRef = '',
  fallbackLabel,
  onOpenAgent,
}: {
  sessionId: string;
  agentRef?: string;
  fallbackLabel?: string;
  onOpenAgent: () => void;
}) {
  const { supported, agent, update, propose, dialog } = usePluginChange(sessionId);
  const resolution = agent.data?.resolution;
  const editable = Boolean(resolution && !agent.data?.subagent);
  const agents = useInstalledAgents(editable);
  const label = resolution?.agent.name || fallbackLabel;
  if (!label && supported === false) return null;
  const delta = agent.data?.delta ?? emptyAgentDelta;
  const changes = delta.add.length + delta.remove.length;
  return (
    <>
      <ConversationAgentControls
        agents={agents.data}
        agentsError={agent.error?.message || agents.error?.message}
        pending={supported !== false && (agent.isPending || (editable && agents.isPending))}
        agentRef={resolution?.agent.ref || agentRef}
        agentLabel={label}
        disabled={update.isPending}
        readOnly={Boolean(agent.data?.subagent)}
        changes={changes}
        onCustomize={onOpenAgent}
        onSelect={
          editable
            ? (ref) => {
                const next = agents.data?.find((item) => item.ref === ref);
                if (!next || next.ref === resolution?.agent.ref) return;
                const name = next.name || next.id;
                propose({
                  ref: next.ref,
                  delta: emptyAgentDelta,
                  summary: changes
                    ? `Switches this conversation to ${name}, without this conversation’s plugin changes.`
                    : `Switches this conversation to ${name}.`,
                  success: `Switched to ${name}`,
                  failure: `The conversation was not switched to ${name}`,
                });
              }
            : undefined
        }
      />
      <PluginChangeDialog {...dialog} />
    </>
  );
}
