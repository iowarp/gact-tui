import type { AgentEntry } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, useInstalledAgents } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentPreviewPane, AgentRow } from './agent-library-row';
import { ListDetailLayout } from './primitives/detail-pane';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { Tag } from './primitives/tag';
import { SavedAgentFile } from './private-local-details';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

/** Installed agents and the person's own agents (a parent plus a delta). */
export function AgentSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const location = useLocation();
  const supported = useAgentPluginsSupported();
  const agents = useInstalledAgents();
  const [previewRef, setPreviewRef] = useState<string>();
  const [sourceAgent, setSourceAgent] = useState<AgentEntry>();
  const defaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
    enabled: supported !== false,
  });
  const local = useQuery({
    // The same namespace the private library reads; saving or deleting an agent refreshes it.
    queryKey: queryKeys.key(
      'agents',
      settings.endpoint,
      'local-sources',
      connectionScope(settings),
    ),
    queryFn: ({ signal }) => repository.localLibrary(signal),
    retry: false,
    enabled: Boolean(sourceAgent),
  });
  useEffect(() => {
    if (!location.hash.startsWith('#agent-')) return;
    const row = document.getElementById(location.hash.slice(1));
    row?.scrollIntoView({ block: 'center' });
    row?.focus({ preventScroll: true });
  }, [location.key, location.hash, agents.data]);
  const remove = useMutation({
    mutationFn: (agent: AgentEntry) => repository.deleteUserAgent(agent.id),
    onSuccess: async (_value, agent) => {
      setPreviewRef((current) => (current === agent.ref ? undefined : current));
      await queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) });
      toast.success(`Deleted ${agent.name || agent.ref}`);
    },
    onError: (error: Error) => toast.error(`Could not delete the agent: ${error.message}`),
  });
  const heading = (
    <SettingsSectionHeading
      description="Explore an agent’s plugins and prompt, change its composition, and save your own local variation."
      title="Agents"
    />
  );
  if (supported === false) {
    return (
      <div className="grid gap-2">
        {heading}
        <StateView kind="unavailable" size="row" title="This service doesn’t offer agents." />
      </div>
    );
  }
  const all = agents.data ?? [];
  const mine = all.filter((agent) => agent.kind === 'user');
  // The person's chosen default when it's still installed, else the service's.
  const defaultRef =
    [defaults.data?.agent_ref, defaults.data?.default_agent_ref].find(
      (ref) => ref && all.some((agent) => agent.ref === ref),
    ) ?? '';
  // The default leads the installed list; the rest keep the service's order.
  const installed = all
    .filter((agent) => agent.kind !== 'user')
    .sort((a, b) => Number(b.ref === defaultRef) - Number(a.ref === defaultRef));
  const previewing = all.find((agent) => agent.ref === previewRef);
  // A new agent starts as a saved variation of an installed one.
  const starter = installed.find((agent) => agent.ref === defaultRef) ?? installed[0];
  const newAgent = starter ? () => setPreviewRef(starter.ref) : undefined;
  const row = (agent: AgentEntry) => (
    <AgentRow
      agent={agent}
      agents={all}
      key={agent.ref}
      onDelete={agent.kind === 'user' ? () => remove.mutateAsync(agent) : undefined}
      onPreview={() => setPreviewRef(agent.ref)}
      onViewSource={agent.kind === 'user' ? () => setSourceAgent(agent) : undefined}
      selected={agent.ref === previewRef}
      slot={
        agent.ref === defaultRef ? (
          <Tag
            className="h-[22px] rounded-[7px] bg-hover px-2 text-xs font-normal text-foreground"
            tone="chip"
            width="auto"
          >
            Default
          </Tag>
        ) : null
      }
    />
  );
  const list = (
    <div className="min-w-0">
      <SettingsGroupLabel className="mt-2">Installed agents</SettingsGroupLabel>
      <ItemList label="Installed agents">
        {agents.isPending ? (
          <StateView kind="loading" size="row" title="Loading agents…" />
        ) : agents.error ? (
          <StateView
            action={{ label: 'Retry', onClick: () => void agents.refetch() }}
            kind="error"
            size="row"
            title="Agents couldn’t be loaded."
          />
        ) : installed.length ? (
          installed.map(row)
        ) : (
          <StateView kind="empty" size="row" title="No agents are installed." />
        )}
      </ItemList>
      {agents.isPending || agents.error ? null : (
        <>
          <SettingsGroupLabel addLabel="New agent" onAdd={newAgent}>
            Your agents
          </SettingsGroupLabel>
          <ItemList label="Your agents">
            {mine.length ? (
              mine.map(row)
            ) : (
              <StateView kind="empty" size="row" title="No agents of your own yet." />
            )}
          </ItemList>
        </>
      )}
    </div>
  );
  return (
    <div className="min-w-0">
      {heading}
      <ListDetailLayout
        className="min-h-[24rem]"
        detail={
          previewing ? (
            <AgentPreviewPane
              agent={previewing}
              key={previewing.ref}
              onClose={() => setPreviewRef(undefined)}
            />
          ) : undefined
        }
        list={list}
      />
      {sourceAgent ? (
        <SavedAgentFile
          agent={sourceAgent}
          error={local.error?.message}
          onClose={() => setSourceAgent(undefined)}
          onRetry={() => void local.refetch()}
          pending={local.isPending}
          source={local.data?.agents.find((source) => source.ref === sourceAgent.ref)}
        />
      ) : null}
    </div>
  );
}
