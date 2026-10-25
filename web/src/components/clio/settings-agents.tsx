import type { AgentEntry } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BotIcon, UserRoundIcon, ChevronRightIcon } from 'lucide-react';
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, useInstalledAgents } from '@/hooks/use-session-agent';
import { agentSearchTarget } from '@/lib/global-search-commands';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { agentDisplayName } from '@/lib/plugin-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DraftAgentCompositionView } from './agent-composition-view';
import { CatalogGroup } from './catalog-group';
import type { DraftAgent } from '@/hooks/use-draft-agent-change';
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
        description="Explore an agent’s plugins and prompt, change its composition, and save your own local variation."
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
                Open an installed agent to explore it and save your own variation.
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
            {[...new Set(installed.map((agent) => agent.marketplace))].map((marketplace) => (
              <CatalogGroup
                key={marketplace}
                name={marketplace}
                count={installed.filter((agent) => agent.marketplace === marketplace).length}
              >
                <ul className="grid gap-2">
                  {installed
                    .filter((agent) => agent.marketplace === marketplace)
                    .map((agent) => (
                      <AgentRow
                        key={agent.ref}
                        agent={agent}
                        agents={agents.data ?? []}
                        onPreview={() => setPreviewing(agent)}
                      />
                    ))}
                </ul>
              </CatalogGroup>
            ))}
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
        <AgentPreviewDialog
          key={previewing.ref}
          agent={previewing}
          onClose={() => setPreviewing(undefined)}
        />
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
      className="relative flex min-w-0 items-start gap-3 rounded-lg border px-3 py-3 hover:bg-muted/40 target:border-primary/50 target:bg-primary/10"
      id={agentSearchTarget(agent.ref)}
      tabIndex={-1}
    >
      <button
        type="button"
        aria-label={`Explore ${agent.name || agent.id}`}
        onClick={onPreview}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
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
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
      </button>
      <div className="relative z-10 flex items-center gap-1">
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
  const [draft, setDraft] = useState<DraftAgent>({
    ref: agent.ref,
    delta: { add: [], remove: [] },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[min(48rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogTitle className="sr-only">{agent.name || agent.ref}</DialogTitle>
        <DialogDescription className="sr-only">
          Explore this agent and save a local variation.
        </DialogDescription>
        <DraftAgentCompositionView draft={draft} onChange={setDraft} library />
      </DialogContent>
    </Dialog>
  );
}
