import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import type { AgentBlueprint, AgentBlueprintSource } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BoxesIcon, EyeIcon } from 'lucide-react';
import { AddIcon, DeleteIcon, MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Frame, FramePanel } from '@/components/reui/frame';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioStatus } from './status';
import { BlueprintDetailsDialog } from './blueprint-details-dialog';
import { MarketplaceSourceDialog, type MarketplaceSourceInput } from './marketplace-source-dialog';
import { MarketplaceSourceRow } from './marketplace-source-row';
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
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{title}</h1>
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
        toast.warning(source.error || 'Marketplace needs attention');
      else toast.success('Marketplace added');
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
        toast.warning(source.error || 'Marketplace needs attention');
      else toast.success('Marketplace reloaded');
    },
    onError: (error) => toast.error(error.message),
  });
  const removeSource = useMutation({
    mutationFn: (id: string) => repository.deleteAgentBlueprintSource(id),
    onSuccess: async () => {
      setDeleteSource(undefined);
      await invalidate();
      toast.success('Source removed');
    },
    onError: (error) => toast.error(error.message),
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
    onError: (error) => toast.error(error.message),
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
    onError: (error) => toast.error(error.message),
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
    onError: (error) => toast.error(error.message),
  });
  const installedBlueprints = blueprints.data?.filter(
    (blueprint) => blueprint.kind !== 'pack' && blueprint.materialized !== false,
  );
  const isInstalled = (source: AgentBlueprintSource, id: string) =>
    installedBlueprints?.some(
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
    <div className="grid gap-6">
      <SectionHeading
        description={`Connected ${vocab.agent} · ${hostLabel}`}
        title="Marketplaces and blueprints"
      />
      <Select
        value={workspaceId}
        onValueChange={(workspaceId) => {
          setSelectedBlueprint(undefined);
          setDeleteBlueprint(undefined);
          queryClient.setQueryData(viewKey, { ...view.data, workspaceId });
        }}
      >
        <SelectTrigger aria-label="Marketplace workspace" className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="global">All workspaces</SelectItem>
          {workspaces.data?.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        onValueChange={(tab) => queryClient.setQueryData(viewKey, { ...view.data, tab })}
      >
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="sources">Marketplaces</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4 grid gap-3" value="installed">
          {installedBlueprints?.map((blueprint) => (
            <Frame key={blueprint.identity || blueprint.id} spacing="sm">
              <FramePanel className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <BoxesIcon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      className="min-w-0 flex-1 truncate rounded-sm text-left font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setSelectedBlueprint(blueprint)}
                      type="button"
                    >
                      {blueprint.display_name}
                    </button>
                    <ClioStatus
                      className="shrink-0"
                      value={blueprint.enabled ? 'healthy' : 'degraded'}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge variant="outline">
                      {blueprint.scope === 'global' ? 'All workspaces' : 'This workspace'}
                    </Badge>
                    <Badge variant="outline">
                      {blueprint.version ? `Version ${blueprint.version}` : 'Version unavailable'}
                    </Badge>
                  </div>
                  <p className="mt-2 min-h-10 line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {blueprint.description || 'No description provided.'}
                  </p>
                  {blueprint.validation_errors.length ? (
                    <ul className="mt-3 grid gap-1 text-xs text-destructive">
                      {blueprint.validation_errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`Actions for ${blueprint.display_name}`}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <MoreIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem onSelect={() => setSelectedBlueprint(blueprint)}>
                      <EyeIcon aria-hidden="true" /> View details
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => update.mutate(blueprint)}>
                      <RefreshIcon aria-hidden="true" /> Reload installed copy
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={
                        (blueprint.blueprint_id ?? blueprint.id) === 'base-agent' &&
                        blueprint.scope === 'global'
                      }
                      onSelect={() => setDeleteBlueprint(blueprint)}
                      variant="destructive"
                    >
                      <DeleteIcon aria-hidden="true" /> Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </FramePanel>
            </Frame>
          ))}
          {!blueprints.isPending && !installedBlueprints?.length ? (
            <EmptyCatalog icon={BoxesIcon} label="No agent blueprints are installed" />
          ) : null}
        </TabsContent>
        <TabsContent className="mt-4 grid gap-4" value="sources">
          <div className="flex justify-end">
            <Button onClick={() => setSourceDialogOpen(true)} size="sm">
              <AddIcon aria-hidden="true" /> Add marketplace
            </Button>
          </div>
          {sources.data
            ?.filter(
              (source) =>
                source.install_scope !== 'workspace' || source.workspace_id === workspaceId,
            )
            .map((source) => (
              <MarketplaceSourceRow
                key={source.id}
                source={source}
                hostLabel={hostLabel}
                scopeLabel={
                  source.install_scope === 'workspace'
                    ? workspaces.data?.find((row) => row.id === source.workspace_id)
                        ?.display_name || 'Workspace'
                    : 'All workspaces'
                }
                pending={
                  (refreshSource.isPending && refreshSource.variables === source.id) ||
                  install.isPending
                }
                isInstalled={(id) => Boolean(isInstalled(source, id))}
                onReload={() => refreshSource.mutate(source.id)}
                onConfigure={() => {
                  configureSource.reset();
                  setEditingSource(source);
                }}
                onRemove={() => setDeleteSource(source)}
                onInstall={(blueprintId) => install.mutate({ source, blueprintId })}
              />
            ))}
          {!sources.isPending && !sources.data?.length ? (
            <EmptyCatalog icon={BoxesIcon} label="No marketplaces connected" />
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
