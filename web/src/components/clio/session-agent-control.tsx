import { deltaWith, emptyAgentDelta, pluginReferenceId } from '@clio/core/v3';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePluginCatalog, useSessionAgent } from '@/hooks/use-session-agent';
import { AddIcon } from '@/lib/icon-vocabulary';
import { AgentPluginMenu } from './agent-plugin-menu';

/**
 * The conversation's agent beside its title: the agent's name opens the agent
 * panel (plugins, provenance, composed prompt), and + adds a plugin to this
 * conversation directly.
 */
export function SessionAgentControl({
  sessionId,
  fallbackLabel,
  onOpenAgent,
}: {
  sessionId: string;
  fallbackLabel?: string;
  onOpenAgent: () => void;
}) {
  const { agent, update } = useSessionAgent(sessionId);
  const resolution = agent.data?.resolution;
  const editable = Boolean(resolution && !agent.data?.subagent);
  const catalog = usePluginCatalog(editable);
  const label = resolution?.agent.name || fallbackLabel;
  if (!label) return null;
  const delta = agent.data?.delta ?? emptyAgentDelta;
  const changes = delta.add.length + delta.remove.length;
  return (
    <span className="flex min-w-0 shrink items-center gap-0.5">
      <Button
        className="h-7 min-w-0 max-w-full justify-start px-1.5 text-xs font-normal text-muted-foreground"
        onClick={onOpenAgent}
        size="xs"
        aria-label={`Open agent ${label}${changes ? `, ${changes === 1 ? '1 change' : `${changes} changes`} in this conversation` : ''}`}
        title={`Open agent ${label}`}
        variant="ghost"
      >
        <span className="truncate">{label}</span>
        {changes ? (
          <span className="shrink-0 text-[0.625rem] text-muted-foreground max-sm:hidden">
            ({changes === 1 ? '1 change' : `${changes} changes`})
          </span>
        ) : null}
      </Button>
      {editable && resolution ? (
        <AgentPluginMenu
          delta={delta}
          disabled={update.isPending}
          onAdd={(plugin) =>
            update.mutate(
              { delta: deltaWith(delta, { add: plugin }) },
              {
                onSuccess: () =>
                  toast.success(`Added ${pluginReferenceId(plugin)} to this conversation`),
                onError: (error) =>
                  toast.error(`${pluginReferenceId(plugin)} was not added`, {
                    description: error.message,
                  }),
              },
            )
          }
          plugins={catalog.data?.plugins}
          pluginsError={catalog.error?.message}
          resolution={resolution}
        >
          <Button
            aria-label="Add a plugin to this conversation"
            size="icon-xs"
            title="Add a plugin"
            variant="ghost"
          >
            <AddIcon aria-hidden="true" />
          </Button>
        </AgentPluginMenu>
      ) : null}
    </span>
  );
}
