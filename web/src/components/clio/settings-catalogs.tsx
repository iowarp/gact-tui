import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import type { AgentBlueprint, AgentBlueprintSource } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BoxesIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InstalledBlueprints } from './installed-blueprints';
import { BlueprintDetailsDialog } from './blueprint-details-dialog';
import { MarketplaceSourceDialog, type MarketplaceSourceInput } from './marketplace-source-dialog';
import { MarketplaceSourceRow } from './marketplace-source-row';
import { marketplaceErrorSummary } from './marketplace-errors';
import { MarketplaceFeedback } from './marketplace-feedback';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Settings</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </header>
  );
}

export function BlueprintSettings({ initialBlueprintId }: { initialBlueprintId?: string }) {
  const { settings } = useConnectionSettings();
  return (
    <BlueprintSettingsContent
      key={connectionScope(settings)}
      initialBlueprintId={initialBlueprintId}
    />
  );
}

function BlueprintSettingsContent({ initialBlueprintId }: { initialBlueprintId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<AgentBlueprintSource>();
  const [search, setSearch] = useState('');
  const cacheOwner = connectionScope(settings);
  const viewKey = ['marketplace-view', cacheOwner];
  const view = useQuery({
    queryKey: viewKey,
    queryFn: () =>
      queryClient.getQueryData<{ workspaceId: string; tab: string }>(viewKey) ?? {
        workspaceId: 'global',
        tab: 'installed',
      },
    initialData: { workspaceId: 'global', tab: 'installed' },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const workspaceId = view.data.workspaceId;
  const host = useQuery({
    queryKey: ['host-storage', cacheOwner, 'local'],
    queryFn: ({ signal }) => repository.hostStorageSettings('local', signal),
    retry: false,
  });
  const hostLabel = host.data?.hostname
    ? `${settings.label || host.data.host_label} · ${host.data.hostname}`
    : settings.label || settings.endpoint;
  const [selectedBlueprint, setSelectedBlueprint] = useState<AgentBlueprint>();
  const [deleteBlueprint, setDeleteBlueprint] = useState<AgentBlueprint>();
  const [deleteSource, setDeleteSource] = useState<AgentBlueprintSource>();
  const openedDeepLink = useRef(false);
  const blueprints = useQuery({
    queryKey: queryKeys.key(
      'agent-blueprints',
      settings.endpoint,
      cacheOwner,
      'settings',
      workspaceId,
    ),
    queryFn: ({ signal }) =>
      repository.agentBlueprints(workspaceId === 'global' ? undefined : workspaceId, signal),
  });
  const sources = useQuery({
    queryKey: queryKeys.key('agent-blueprint-sources', settings.endpoint, cacheOwner),
    queryFn: ({ signal }) => repository.agentBlueprintSources(signal),
  });
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint, cacheOwner),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('agent-blueprints', settings.endpoint),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('agent-blueprint-sources', settings.endpoint),
      }),
    ]);
  };
  const addSource = useMutation({
    mutationFn: (input: MarketplaceSourceInput) => repository.addAgentBlueprintSource(input),
    onSuccess: async (source) => {
      setSourceDialogOpen(false);
      await invalidate();
      if (source.status === 'degraded')
        toast.warning(marketplaceErrorSummary(source.error || 'Marketplace needs attention'));
      else toast.success('Marketplace added');
    },
    // Failed setup can still save a registration for repair. Reflect that row
    // immediately instead of letting the next Add fail as a hidden duplicate.
    onError: () => {
      void invalidate();
    },
  });
  const configureSource = useMutation({
    mutationFn: ({
      source,
      input,
    }: {
      source: AgentBlueprintSource;
      input: MarketplaceSourceInput;
    }) => {
      const { scope: _scope, workspace_id: _workspace, ...configuration } = input;
      return repository.configureAgentBlueprintSource(source.id, {
        ...configuration,
        expected_updated_at: source.updated_at ?? '',
      });
    },
    onSuccess: async () => {
      setEditingSource(undefined);
      await invalidate();
      toast.success('Configuration saved');
    },
  });
  const refreshSource = useMutation({
    mutationFn: (id: string) => repository.refreshAgentBlueprintSource(id),
    onSuccess: async (source) => {
      await invalidate();
      if (source.status === 'degraded')
        toast.warning(marketplaceErrorSummary(source.error || 'Marketplace needs attention'));
      else toast.success('Marketplace reloaded');
    },
    onError: (error) => {
      void invalidate();
      toast.error(marketplaceErrorSummary(error.message));
    },
  });
  const removeSource = useMutation({
    mutationFn: (id: string) => repository.deleteAgentBlueprintSource(id),
    onSuccess: async () => {
      setDeleteSource(undefined);
      await invalidate();
      toast.success('Source removed');
    },
    onError: (error) => toast.error(marketplaceErrorSummary(error.message)),
  });
  const install = useMutation({
    mutationFn: ({ source, blueprintId }: { source: AgentBlueprintSource; blueprintId: string }) =>
      repository.installAgentBlueprint({
        source_id: source.id,
        blueprint_id: blueprintId,
        scope: source.install_scope === 'workspace' ? 'workspace' : 'global',
        workspace_id: source.workspace_id,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Blueprint installed');
    },
    onError: (error) => toast.error(marketplaceErrorSummary(error.message)),
  });
  const update = useMutation({
    mutationFn: (blueprint: AgentBlueprint) =>
      repository.updateAgentBlueprint(blueprint.identity || blueprint.id, {
        scope: blueprint.scope === 'global' ? 'global' : 'workspace',
        workspace_id: workspaceId === 'global' ? undefined : workspaceId,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Blueprint updated');
    },
    onError: (error) => toast.error(marketplaceErrorSummary(error.message)),
  });
  const removeBlueprint = useMutation({
    mutationFn: (blueprint: AgentBlueprint) =>
      repository.deleteAgentBlueprint(blueprint.identity || blueprint.id, {
        scope: blueprint.scope === 'global' ? 'global' : 'workspace',
        workspace_id: workspaceId === 'global' ? undefined : workspaceId,
      }),
    onSuccess: async () => {
      setDeleteBlueprint(undefined);
      await invalidate();
      toast.success('Blueprint removed');
    },
    onError: (error) => toast.error(marketplaceErrorSummary(error.message)),
  });
  const installedBlueprints = blueprints.data?.filter(
    (blueprint) =>
      blueprint.kind !== 'pack' &&
      blueprint.materialized !== false &&
      (workspaceId !== 'global' || blueprint.scope === 'global'),
  );
  const matchesSearch = (text: string) =>
    text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const visibleSources = sources.data?.filter(
    (source) =>
      (source.install_scope !== 'workspace' || source.workspace_id === workspaceId) &&
      matchesSearch(`${source.name} ${source.source}`),
  );
  const installedFrom = (source: AgentBlueprintSource, id: string) =>
    installedBlueprints?.find(
      (blueprint) =>
        (blueprint.blueprint_id ?? blueprint.id) === id &&
        (blueprint.source_id === source.id ||
          (!blueprint.source_id &&
            (blueprint.metadata.install as { source?: string } | undefined)?.source ===
              source.source)),
    );
  useEffect(() => {
    if (!initialBlueprintId || openedDeepLink.current || !installedBlueprints) return;
    openedDeepLink.current = true;
    setSelectedBlueprint(
      installedBlueprints.find((blueprint) => blueprint.id === initialBlueprintId),
    );
  }, [initialBlueprintId, installedBlueprints]);

  return (
    <div className="grid min-w-0 gap-4">
      <SectionHeading
        description={`Connected ${vocab.agent} · ${hostLabel}`}
        title="Marketplaces and blueprints"
      />
      <div className="grid gap-1.5">
        <label htmlFor="marketplace-workspace" className="text-xs font-medium">
          Workspace view
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Select
            value={workspaceId}
            onValueChange={(workspaceId) => {
              setSelectedBlueprint(undefined);
              setDeleteBlueprint(undefined);
              queryClient.setQueryData(viewKey, { ...view.data, workspaceId });
            }}
          >
            <SelectTrigger
              id="marketplace-workspace"
              aria-label="Workspace access"
              className="w-full min-w-0 sm:w-60"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Shared across workspaces</SelectItem>
              {workspaces.data?.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  Workspace: {workspace.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {workspaceId === 'global'
            ? 'Shared blueprints and marketplaces are available in every workspace.'
            : 'Includes shared blueprints and marketplaces, plus those added only to this workspace.'}
        </p>
      </div>
      <Input
        className="min-w-0"
        aria-label={
          view.data.tab === 'sources' ? 'Search marketplaces' : 'Search installed blueprints'
        }
        placeholder={
          view.data.tab === 'sources' ? 'Search marketplaces' : 'Search installed blueprints'
        }
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {blueprints.error || sources.error ? (
        <p role="alert" className="text-sm text-destructive">
          {blueprints.error?.message || sources.error?.message}
        </p>
      ) : null}
      {blueprints.isPending || sources.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading marketplaces…
        </p>
      ) : null}
      <Tabs
        value={view.data.tab}
        onValueChange={(tab) => {
          setSearch('');
          queryClient.setQueryData(viewKey, { ...view.data, tab });
        }}
      >
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="sources">Marketplaces</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="installed">
          {update.error && (
            <div className="mb-3">
              <MarketplaceFeedback error={update.error.message} />
            </div>
          )}
          {removeBlueprint.error && (
            <div className="mb-3">
              <MarketplaceFeedback error={removeBlueprint.error.message} />
            </div>
          )}
          <InstalledBlueprints
            key={workspaceId}
            blueprints={installedBlueprints ?? []}
            sources={sources.data ?? []}
            search={search}
            loading={blueprints.isPending}
            onClearSearch={() => setSearch('')}
            onDetails={setSelectedBlueprint}
            onReload={(row) => update.mutate(row)}
            onRemove={setDeleteBlueprint}
            reloadingId={
              update.isPending ? update.variables.identity || update.variables.id : undefined
            }
          />
        </TabsContent>
        <TabsContent className="mt-4 grid gap-4" value="sources">
          {install.error && <MarketplaceFeedback error={install.error.message} />}
          {removeSource.error && <MarketplaceFeedback error={removeSource.error.message} />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Browse collections of agent blueprints or add your own.
            </p>
            <Button
              onClick={() => {
                addSource.reset();
                setSourceDialogOpen(true);
              }}
              size="sm"
            >
              <AddIcon aria-hidden="true" /> Add marketplace
            </Button>
          </div>
          {visibleSources?.map((source) => (
            <MarketplaceSourceRow
              key={source.id}
              source={source}
              scopeLabel={
                source.install_scope === 'workspace'
                  ? workspaces.data?.find((row) => row.id === source.workspace_id)?.display_name ||
                    'Workspace'
                  : 'Shared across workspaces'
              }
              pending={
                (refreshSource.isPending && refreshSource.variables === source.id) ||
                install.isPending
              }
              reloading={refreshSource.isPending && refreshSource.variables === source.id}
              installingId={
                install.isPending && install.variables.source.id === source.id
                  ? install.variables.blueprintId
                  : undefined
              }
              isInstalled={(id) => Boolean(installedFrom(source, id))}
              installedVersion={(id) => installedFrom(source, id)?.version}
              onReload={() => refreshSource.mutate(source.id)}
              onConfigure={() => {
                configureSource.reset();
                setEditingSource(source);
              }}
              onRemove={() => setDeleteSource(source)}
              onInstall={(blueprintId) => install.mutate({ source, blueprintId })}
              onDetails={(id) => setSelectedBlueprint(installedFrom(source, id))}
            />
          ))}
          {!sources.isPending && !visibleSources?.length ? (
            <EmptyCatalog
              icon={BoxesIcon}
              label={
                search ? 'No marketplaces match your search' : 'No marketplaces connected here'
              }
            />
          ) : null}
        </TabsContent>
      </Tabs>

      {sourceDialogOpen ? (
        <MarketplaceSourceDialog
          error={addSource.error?.message}
          onAdd={(input) => addSource.mutate(input)}
          onOpenChange={setSourceDialogOpen}
          open
          pending={addSource.isPending}
          workspaces={workspaces.data ?? []}
          hostLabel={hostLabel}
          defaultWorkspaceId={workspaceId}
        />
      ) : null}
      {editingSource ? (
        <MarketplaceSourceDialog
          key={editingSource.id}
          initial={editingSource}
          error={configureSource.error?.message}
          onAdd={(input) => configureSource.mutate({ source: editingSource, input })}
          onOpenChange={(open) => !open && setEditingSource(undefined)}
          open
          pending={configureSource.isPending}
          workspaces={workspaces.data ?? []}
          hostLabel={hostLabel}
        />
      ) : null}
      <BlueprintDetailsDialog
        blueprint={
          selectedBlueprint &&
          blueprints.data?.find(
            (row) =>
              (row.identity || row.id) === (selectedBlueprint.identity || selectedBlueprint.id),
          )
        }
        onOpenChange={(open) => !open && setSelectedBlueprint(undefined)}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteSource(undefined)}
        open={Boolean(deleteSource)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove marketplace {deleteSource?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This forgets the marketplace. Installed blueprints remain installed until removed
              separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSource && removeSource.mutate(deleteSource.id)}
              variant="destructive"
            >
              Remove marketplace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteBlueprint(undefined)}
        open={Boolean(deleteBlueprint)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteBlueprint?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sessions already using this blueprint may lose access to its agents and declared
              tools.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBlueprint && removeBlueprint.mutate(deleteBlueprint)}
              variant="destructive"
            >
              Remove blueprint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyCatalog({ icon: Icon, label }: { icon: typeof BoxesIcon; label: string }) {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border p-10 text-center">
      <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
