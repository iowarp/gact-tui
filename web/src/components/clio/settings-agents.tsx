import type { AgentEntry } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, useInstalledAgents } from '@/hooks/use-session-agent';

import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentRow, AgentPreviewDialog } from './agent-library-row';
import { CatalogGroup } from './catalog-group';

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
