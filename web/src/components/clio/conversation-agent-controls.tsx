import type { AgentEntry } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import { agentDisplayName } from '@/lib/plugin-presentation';

interface ConversationAgentControlsProps {
  agents?: readonly AgentEntry[];
  agentsError?: string;
  agentRef: string;
  agentLabel?: string;
  defaultRef?: string;
  pending?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  changes?: number;
  onSelect?: (ref: string) => void;
  onCustomize: () => void;
}

/** The same agent choice and Agent-panel entry before and after a conversation is created. */
export function ConversationAgentControls({
  agents,
  agentsError,
  agentRef,
  agentLabel,
  defaultRef,
  pending = agents === undefined,
  disabled = false,
  readOnly = false,
  changes = 0,
  onSelect,
  onCustomize,
}: ConversationAgentControlsProps) {
  const listed = agents?.some((agent) => agent.ref === agentRef);
  const ownAgents = agents?.filter((agent) => agent.kind === 'user') ?? [];
  const installedAgents = agents?.filter((agent) => agent.kind !== 'user') ?? [];
  const customizeLabel = readOnly
    ? 'View agent'
    : changes
      ? `Customize the agent (${changes} ${changes === 1 ? 'change' : 'changes'})`
      : 'Customize the agent';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label className="flex min-w-0 items-center gap-2 text-sm">
        <span className="max-sm:sr-only">with</span>
        <select
          aria-label="Conversation agent"
          className="min-w-0 max-w-36 rounded-md border border-border bg-background px-2 py-1 sm:max-w-48"
          disabled={disabled || readOnly || !onSelect || pending || Boolean(agentsError && !agents)}
          onChange={(event) => onSelect?.(event.target.value)}
          title={
            agentsError || (readOnly ? 'This conversation runs a defined subagent' : undefined)
          }
          value={agentRef}
        >
          {!listed ? (
            <option value={agentRef}>
              {agentRef || agentLabel
                ? agentLabel || agentDisplayName(agentRef, agents)
                : pending
                  ? 'Loading agents…'
                  : agentsError
                    ? 'Agents unavailable'
                    : 'Default agent'}
              {agentRef && agentRef === defaultRef ? ' (default)' : ''}
            </option>
          ) : null}
          {ownAgents.length ? (
            <optgroup label="Your agents">
              {ownAgents.map((agent) => (
                <option key={agent.ref} title={agent.description || undefined} value={agent.ref}>
                  {agent.name || agent.id}
                </option>
              ))}
            </optgroup>
          ) : null}
          {installedAgents.length ? (
            <optgroup label="Installed agents">
              {installedAgents.map((agent) => (
                <option key={agent.ref} title={agent.description || undefined} value={agent.ref}>
                  {agent.name || agent.id}
                  {agent.ref === defaultRef ? ' (default)' : ''}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
      {agentRef || agentLabel ? (
        <Button
          aria-label={customizeLabel}
          disabled={disabled}
          onClick={onCustomize}
          size="sm"
          variant="ghost"
        >
          <ConfigureIcon aria-hidden="true" />
          <span className="max-sm:sr-only">
            {readOnly ? 'Agent' : changes ? `Customized (${changes})` : 'Customize'}
          </span>
          {changes && !readOnly ? (
            <span aria-hidden="true" className="text-xs sm:hidden">
              {changes}
            </span>
          ) : null}
        </Button>
      ) : null}
    </div>
  );
}
