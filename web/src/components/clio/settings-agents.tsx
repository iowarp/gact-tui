import type { AgentEntry } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, useInstalledAgents } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { newItemKey } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentPreviewPane, AgentRow } from './agent-library-row';
import { ListDetailLayout } from './primitives/detail-pane';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { Tag } from './primitives/tag';
import { SavedAgentFile } from './private-local-details';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { t, ph } from '@lingui/core/macro';

/** Installed agents and the person's own agents (a parent plus a delta). */
export function AgentSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const location = useLocation();
  const supported = useAgentPluginsSupported();
  const agents = useInstalledAgents();
  const [previewRef, setPreviewRef] = useState<string>();
  // Each New agent bumps this: the starter's pane remounts with its save dialog open.
  const [naming, setNaming] = useState(0);
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
      toast.success(t`Deleted ${ph({ name: agent.name || agent.ref })}`);
    },
    onError: (error: Error) =>
      toast.error(t`Could not delete the agent: ${ph({ message: error.message })}`),
  });
  const heading = (
    <SettingsSectionHeading
      description={t`Explore an agent’s plugins and prompt, change its composition, and save your own local variation.`}
      title={t`Agents`}
    />
  );
  if (supported === false) {
    return (
      <div className="grid gap-2">
        {heading}
        <StateView kind="unavailable" size="row" title={t`This service doesn’t offer agents.`} />
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
  const newAgent = starter
    ? () => {
        setPreviewRef(starter.ref);
        setNaming((count) => count + 1);
      }
    : undefined;
  const preview = (ref: string) => {
    setPreviewRef(ref);
    setNaming(0);
  };
  const row = (agent: AgentEntry) => (
    <AgentRow
      agent={agent}
      agents={all}
      key={agent.ref}
      onDelete={agent.kind === 'user' ? () => remove.mutateAsync(agent) : undefined}
      onPreview={() => preview(agent.ref)}
      onViewSource={agent.kind === 'user' ? () => setSourceAgent(agent) : undefined}
      selected={agent.ref === previewRef}
      slot={
        agent.ref === defaultRef ? (
          <Tag
            className={cn(
              'h-[22px] rounded-[7px] bg-hover px-2 text-xs font-normal text-foreground',
              // The selected row's fill matches the chip's; an edge keeps it a chip.
              agent.ref === previewRef && 'border border-input bg-background',
            )}
            tone="chip"
            width="auto"
          >
            {t`Default`}
          </Tag>
        ) : null
      }
    />
  );
  const list = (
    <div className="min-w-0" onKeyDown={newItemKey(newAgent)}>
      <SettingsGroupLabel className="mt-2">{t`Installed agents`}</SettingsGroupLabel>
      <ItemList label={t`Installed agents`}>
        {agents.isPending ? (
          <StateView kind="loading" size="row" title={t`Loading agents…`} />
        ) : agents.error ? (
          <StateView
            action={{ label: t`Retry`, onClick: () => void agents.refetch() }}
            kind="error"
            size="row"
            title={t`Agents couldn’t be loaded.`}
          />
        ) : installed.length ? (
          installed.map(row)
        ) : (
          <StateView kind="empty" size="row" title={t`No agents are installed.`} />
        )}
      </ItemList>
      {agents.isPending || agents.error ? null : (
        <>
          <SettingsGroupLabel addLabel={t`New agent`} onAdd={newAgent}>
            {t`Your agents`}
          </SettingsGroupLabel>
          <ItemList label={t`Your agents`}>
            {mine.length ? (
              mine.map(row)
            ) : (
              <StateView kind="empty" size="row" title={t`No agents of your own yet.`} />
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
              key={`${previewing.ref}:${naming}`}
              naming={naming > 0}
              onClose={() => {
                setPreviewRef(undefined);
                setNaming(0);
              }}
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
