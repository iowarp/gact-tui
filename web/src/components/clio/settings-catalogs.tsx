import type { AgentBlueprint, AgentBlueprintSource } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BoxesIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
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
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus } from './status';
import { BlueprintDetailsDialog } from './blueprint-details-dialog';
import { MarketplaceSourceDialog, type MarketplaceSourceInput } from './marketplace-source-dialog';

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Settings</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </header>
  );
}

export function BlueprintSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = useState<AgentBlueprint>();
  const [deleteBlueprint, setDeleteBlueprint] = useState<AgentBlueprint>();
  const [deleteSource, setDeleteSource] = useState<AgentBlueprintSource>();
  const blueprints = useQuery({
    queryKey: ['agent-blueprints', settings.endpoint, 'settings'],
    queryFn: ({ signal }) => repository.agentBlueprints(undefined, signal),
  });
  const sources = useQuery({
    queryKey: ['agent-blueprint-sources', settings.endpoint],
    queryFn: ({ signal }) => repository.agentBlueprintSources(signal),
  });
  const workspaces = useQuery({
    queryKey: ['workspaces', settings.endpoint],
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['agent-blueprints', settings.endpoint] }),
      queryClient.invalidateQueries({ queryKey: ['agent-blueprint-sources', settings.endpoint] }),
    ]);
  };
  const addSource = useMutation({
    mutationFn: (input: MarketplaceSourceInput) => repository.addAgentBlueprintSource(input),
    onSuccess: async () => {
      setSourceDialogOpen(false);
      await invalidate();
      toast.success('Source added');
    },
  });
  const refreshSource = useMutation({
    mutationFn: (id: string) => repository.refreshAgentBlueprintSource(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Source refreshed');
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
  });
  const install = useMutation({
    mutationFn: ({ sourceId, blueprintId }: { sourceId: string; blueprintId: string }) =>
      repository.installAgentBlueprint({
        source_id: sourceId,
        blueprint_id: blueprintId,
        scope: 'global',
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Blueprint installed');
    },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: (blueprint: AgentBlueprint) =>
      repository.updateAgentBlueprint(blueprint.id, {
        scope: blueprint.scope === 'global' ? 'global' : 'workspace',
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Blueprint updated');
    },
    onError: (error) => toast.error(error.message),
  });
  const removeBlueprint = useMutation({
    mutationFn: (blueprint: AgentBlueprint) =>
      repository.deleteAgentBlueprint(blueprint.id, {
        scope: blueprint.scope === 'global' ? 'global' : 'workspace',
      }),
    onSuccess: async () => {
      setDeleteBlueprint(undefined);
      await invalidate();
      toast.success('Blueprint removed');
    },
  });
  const installedBlueprints = blueprints.data?.filter((blueprint) => blueprint.kind !== 'pack');
  const installedIds = new Set(installedBlueprints?.map((blueprint) => blueprint.id));

  return (
    <div className="grid gap-6">
      <SectionHeading
        description="Manage installed agent blueprints and the marketplaces that publish them. Marketplace status, commit, validation, and availability come from the connected service."
        title="Marketplaces and blueprints"
      />
      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="sources">Marketplaces</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4 grid gap-3" value="installed">
          {installedBlueprints?.map((blueprint) => (
            <Frame key={blueprint.id} spacing="sm">
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
                      <MoreHorizontalIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setSelectedBlueprint(blueprint)}>
                      <EyeIcon aria-hidden="true" /> View details
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => update.mutate(blueprint)}>
                      <RefreshCwIcon aria-hidden="true" /> Check for update
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setDeleteBlueprint(blueprint)}
                      variant="destructive"
                    >
                      <Trash2Icon aria-hidden="true" /> Remove
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
              <PlusIcon aria-hidden="true" /> Add marketplace
            </Button>
          </div>
          {sources.data?.map((source) => (
            <Frame key={source.id} spacing="sm">
              <FrameHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <FrameTitle>{source.name}</FrameTitle>
                    <FrameDescription className="mt-1 break-all font-mono text-xs">
                      {source.source}
                    </FrameDescription>
                  </div>
                  <ClioStatus
                    label={source.status === 'ready' ? 'Ready' : source.status}
                    value={source.status === 'ready' ? 'healthy' : 'degraded'}
                  />
                </div>
              </FrameHeader>
              <FramePanel className="grid gap-2 p-2">
                {source.available_blueprints
                  .filter((available) => available.kind !== 'pack')
                  .map((available) => (
                    <ClioInteractiveRow key={available.id}>
                      <div className="flex items-center gap-3">
                        <BoxesIcon aria-hidden="true" className="size-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{available.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {available.version || 'Version unavailable'}
                          </p>
                        </div>
                        {installedIds.has(available.id) ? (
                          <Badge variant="secondary">Installed</Badge>
                        ) : (
                          <Button
                            disabled={!available.enabled || install.isPending}
                            onClick={() =>
                              install.mutate({ sourceId: source.id, blueprintId: available.id })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Install
                          </Button>
                        )}
                      </div>
                    </ClioInteractiveRow>
                  ))}
                {!source.available_blueprints.some((available) => available.kind !== 'pack') ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    This source reported no available blueprints.
                  </p>
                ) : null}
              </FramePanel>
              <FrameFooter className="flex-row items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {source.commit ? `Commit ${source.commit.slice(0, 12)}` : 'Commit unavailable'}
                </span>
                <div className="flex gap-2">
                  <Button
                    disabled={refreshSource.isPending}
                    onClick={() => refreshSource.mutate(source.id)}
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCwIcon aria-hidden="true" /> Refresh
                  </Button>
                  <Button
                    aria-label={`Remove source ${source.name}`}
                    onClick={() => setDeleteSource(source)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
              </FrameFooter>
            </Frame>
          ))}
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
        />
      ) : null}
      <BlueprintDetailsDialog
        blueprint={selectedBlueprint}
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
