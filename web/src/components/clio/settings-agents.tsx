import type { AgentEntry } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, UserRoundIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, useInstalledAgents } from '@/hooks/use-session-agent';
import { agentSearchTarget } from '@/lib/global-search-commands';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { agentDisplayName, provenanceLabel } from '@/lib/plugin-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ComposedPromptView } from './composed-prompt-view';
import { SettingsSectionHeading } from './settings-section-heading';

/** Installed agents and the person's own agents (a parent plus a delta). */
export function AgentSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const location = useLocation();
  const supported = useAgentPluginsSupported();
  const agents = useInstalledAgents();
  const [deleting, setDeleting] = useState<AgentEntry>();
  const [previewing, setPreviewing] = useState<AgentEntry>();
  useEffect(() => {
    if (!location.hash.startsWith('#agent-')) return;
    const row = document.getElementById(location.hash.slice(1));
    row?.scrollIntoView({ block: 'center' });
    row?.focus({ preventScroll: true });
  }, [location.key, location.hash, agents.data]);
  const remove = useMutation({
    mutationFn: (agent: AgentEntry) => repository.deleteUserAgent(agent.id),
    onSuccess: async (_value, agent) => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) });
      toast.success(`Deleted ${agent.name || agent.ref}`);
    },
  });
  if (supported === false) {
    return (
      <Alert>
        <AlertTitle>Plugins are not available on this service</AlertTitle>
        <AlertDescription>
          The connected service does not compose agents from plugins.
        </AlertDescription>
      </Alert>
    );
  }
  const mine = agents.data?.filter((agent) => agent.kind === 'user') ?? [];
  const installed = agents.data?.filter((agent) => agent.kind !== 'user') ?? [];
  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        description="An agent is an identity, a flow and a set of plugins. Save your own from a conversation's agent panel."
        title="Agents"
      />
      {agents.error ? (
        <Alert variant="destructive">
          <AlertTitle>Agents unavailable</AlertTitle>
          <AlertDescription>{agents.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {agents.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading agents…
        </p>
      ) : null}
      {agents.data ? (
        <>
          <section aria-label="Your agents" className="grid gap-2">
            <h2 className="text-sm font-semibold">Your agents</h2>
            {!mine.length ? (
              <p className="text-sm text-muted-foreground">
                None yet. Change a conversation&apos;s plugins, then choose Save as agent.
              </p>
            ) : null}
            <ul className="grid gap-2">
              {mine.map((agent) => (
                <AgentRow
                  agent={agent}
                  agents={agents.data ?? []}
                  key={agent.ref}
                  onDelete={() => setDeleting(agent)}
                  onPreview={() => setPreviewing(agent)}
                />
              ))}
            </ul>
          </section>
          <section aria-label="Installed agents" className="grid gap-2">
            <h2 className="text-sm font-semibold">Installed agents</h2>
            <ul className="grid gap-2">
              {installed.map((agent) => (
                <AgentRow
                  agent={agent}
                  agents={agents.data ?? []}
                  key={agent.ref}
                  onPreview={() => setPreviewing(agent)}
                />
              ))}
            </ul>
          </section>
        </>
      ) : null}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => (open ? undefined : setDeleting(undefined))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name || deleting?.ref}?</AlertDialogTitle>
            <AlertDialogDescription>
              New conversations can no longer choose it. Conversations already using it keep their
              pinned plugins.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error ? (
            <p className="text-sm text-destructive" role="alert">
              {remove.error.message}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep agent</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove.mutate(deleting);
              }}
            >
              Delete agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {previewing ? (
        <AgentPreviewDialog agent={previewing} onClose={() => setPreviewing(undefined)} />
      ) : null}
    </div>
  );
}

function AgentRow({
  agent,
  agents,
  onPreview,
  onDelete,
}: {
  agent: AgentEntry;
  agents: readonly AgentEntry[];
  onPreview: () => void;
  onDelete?: () => void;
}) {
  const Icon = agent.kind === 'user' ? UserRoundIcon : BotIcon;
  return (
    <li
      className="flex min-w-0 items-start gap-3 rounded-lg border px-3 py-3 target:border-primary/50 target:bg-primary/10"
      id={agentSearchTarget(agent.ref)}
      tabIndex={-1}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{agent.name || agent.id}</span>
          <span className="font-mono text-xs text-muted-foreground">{agent.ref}</span>
          {agent.version ? (
            <span className="text-xs text-muted-foreground">{agent.version}</span>
          ) : null}
          {agent.flow && agent.flow.id !== 'react' ? (
            <Badge variant="outline">Flow {agent.flow.id}</Badge>
          ) : null}
        </div>
        {agent.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
        ) : null}
        {agent.kind === 'user' && agent.extends ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Starts from {agentDisplayName(agent.extends, agents)}
            {agent.delta?.add.length ? ` · adds ${agent.delta.add.join(', ')}` : ''}
            {agent.delta?.remove.length ? ` · removes ${agent.delta.remove.join(', ')}` : ''}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {agent.plugins.length} {agent.plugins.length === 1 ? 'plugin' : 'plugins'}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button onClick={onPreview} size="sm" variant="ghost">
          Preview
        </Button>
        {onDelete ? (
          <Button
            aria-label={`Delete ${agent.name || agent.ref}`}
            onClick={onDelete}
            size="icon-sm"
            variant="ghost"
          >
            <DeleteIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function AgentPreviewDialog({ agent, onClose }: { agent: AgentEntry; onClose: () => void }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const resolution = useQuery({
    queryKey: queryKeys.key('agent-resolution', settings.endpoint, agent.ref),
    queryFn: ({ signal }) => repository.resolveAgent(agent.ref, undefined, signal),
  });
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{agent.name || agent.ref}</DialogTitle>
          <DialogDescription>{agent.role || agent.description || agent.ref}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          {resolution.isPending ? (
            <p className="text-sm text-muted-foreground" role="status">
              Resolving plugins…
            </p>
          ) : null}
          {resolution.error ? (
            <p className="text-sm text-destructive" role="alert">
              This agent does not resolve: {resolution.error.message}
            </p>
          ) : null}
          {resolution.data ? (
            <Tabs defaultValue="plugins">
              <TabsList>
                <TabsTrigger value="plugins">
                  Plugins ({resolution.data.plugins.length})
                </TabsTrigger>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
              </TabsList>
              <TabsContent className="mt-2" value="plugins">
                <ul className="grid gap-1">
                  {resolution.data.plugins.map((plugin) => (
                    <li className="flex flex-wrap items-center gap-2 text-sm" key={plugin.id}>
                      <span className="font-medium">{plugin.id}</span>
                      {plugin.kind === 'pack' ? <Badge variant="secondary">Pack</Badge> : null}
                      <Badge variant="outline">{provenanceLabel(plugin.provenance)}</Badge>
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent className="mt-2" value="prompt">
                <ComposedPromptView resolution={resolution.data} />
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
