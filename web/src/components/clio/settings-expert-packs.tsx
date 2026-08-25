import type { AgentBlueprintSource, ExpertPackDefinition, Workspace } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BoxesIcon,
  MoreHorizontalIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioInteractiveRow } from './interactive-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';

type InstallScope = 'global' | 'workspace';

interface AvailablePack {
  source: AgentBlueprintSource;
  id: string;
  title: string;
  version?: string;
  enabled: boolean;
  validationErrors: string[];
}

function packTitle(pack: ExpertPackDefinition) {
  return pack.display_name || pack.title || pack.id;
}

function isServiceManaged(pack: ExpertPackDefinition) {
  return pack.metadata.lifecycle === 'service';
}

function workspaceTitle(workspace: Workspace) {
  return workspace.display_name || workspace.name;
}

export function ExpertPackSettings({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [scope, setScope] = useState<InstallScope>('global');
  const [workspacePreference, setWorkspacePreference] = useState('');
  const [detailPack, setDetailPack] = useState<ExpertPackDefinition>();
  const [deletePack, setDeletePack] = useState<ExpertPackDefinition>();

  const workspaces = useQuery({
    queryKey: ['workspaces', settings.endpoint, 'expert-pack-settings'],
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const requestedWorkspaceId = workspacePreference || initialWorkspaceId;
  const workspaceId =
    workspaces.data?.find((workspace) => workspace.id === requestedWorkspaceId)?.id ||
    workspaces.data?.[0]?.id ||
    '';

  const packs = useQuery({
    queryKey: ['expert-packs', settings.endpoint, workspaceId || 'global'],
    queryFn: ({ signal }) => repository.expertPacks(workspaceId || undefined, signal),
  });
  const sources = useQuery({
    queryKey: ['agent-blueprint-sources', settings.endpoint],
    queryFn: ({ signal }) => repository.agentBlueprintSources(signal),
  });
  const details = useQuery({
    enabled: Boolean(detailPack),
    queryKey: ['expert-pack', settings.endpoint, detailPack?.id, workspaceId],
    queryFn: ({ signal }) =>
      repository.expertPack(detailPack?.id ?? '', workspaceId || undefined, signal),
  });
  const availablePacks = useMemo<AvailablePack[]>(
    () =>
      (sources.data ?? []).flatMap((source) =>
        source.available_blueprints
          .filter((candidate) => candidate.kind === 'pack')
          .map((candidate) => ({
            source,
            id: candidate.id,
            title: candidate.title,
            version: candidate.version,
            enabled: candidate.enabled,
            validationErrors: candidate.validation_errors,
          })),
      ),
    [sources.data],
  );
  const installedIds = new Set(packs.data?.map((pack) => pack.id));

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expert-packs', settings.endpoint] }),
      queryClient.invalidateQueries({ queryKey: ['agent-blueprints', settings.endpoint] }),
      queryClient.invalidateQueries({ queryKey: ['agents', settings.endpoint] }),
    ]);
  };
  const install = useMutation({
    mutationFn: (candidate: AvailablePack) =>
      repository.installExpertPack({
        source_id: candidate.source.id,
        pack_id: candidate.id,
        scope,
        workspace_id: scope === 'workspace' ? workspaceId : undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Expert pack installed');
    },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: (pack: ExpertPackDefinition) =>
      repository.updateExpertPack(pack.id, {
        scope: pack.scope === 'global' ? 'global' : 'workspace',
        workspace_id: pack.scope === 'global' ? undefined : workspaceId,
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Expert pack updated');
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (pack: ExpertPackDefinition) =>
      repository.deleteExpertPack(pack.id, {
        scope: pack.scope === 'global' ? 'global' : 'workspace',
        workspace_id: pack.scope === 'global' ? undefined : workspaceId,
      }),
    onSuccess: async () => {
      setDeletePack(undefined);
      await invalidate();
      toast.success('Expert pack removed');
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="grid min-w-0 gap-6">
      <SettingsSectionHeading
        description="Install and manage coordinated groups of specialist agents. Their validation, scope, experts, and source provenance come from the connected service."
        title="Expert packs"
      />

      <Frame className="min-w-0" spacing="lg">
        <FrameHeader className="min-w-0 gap-4 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <FrameTitle>Installed packs</FrameTitle>
            <FrameDescription className="mt-1">
              Global packs are available everywhere; workspace packs stay with one project.
            </FrameDescription>
          </div>
          {workspaces.data?.length ? (
            <Field className="w-full md:w-64 md:shrink-0">
              <FieldLabel htmlFor="expert-pack-workspace">Workspace view</FieldLabel>
              <Select onValueChange={setWorkspacePreference} value={workspaceId}>
                <SelectTrigger id="expert-pack-workspace">
                  <SelectValue placeholder="Choose a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.data.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspaceTitle(workspace)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </FrameHeader>
        <FramePanel className="grid gap-2 p-2">
          {packs.data?.map((pack) => {
            const managed = isServiceManaged(pack);
            return (
              <ClioInteractiveRow key={`${pack.scope}:${pack.id}`}>
                <div className="flex items-start gap-3">
                  <PackageCheckIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{packTitle(pack)}</p>
                      <ClioStatus
                        label={pack.enabled ? 'Ready' : 'Needs attention'}
                        value={pack.enabled ? 'healthy' : 'degraded'}
                      />
                      <Badge variant="outline">{pack.scope}</Badge>
                      <Badge variant="outline">{pack.version || 'Version unavailable'}</Badge>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {pack.description || 'No description provided.'}
                    </p>
                    {!managed ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Managed from its configuration directory; inspect it here without changing
                        files behind the service.
                      </p>
                    ) : null}
                    {pack.validation_errors.length ? (
                      <ul className="mt-2 grid gap-1 text-xs text-destructive">
                        {pack.validation_errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`Actions for ${packTitle(pack)}`}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <MoreHorizontalIcon aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <DropdownMenuItem onSelect={() => setDetailPack(pack)}>
                        <UsersIcon aria-hidden="true" /> View experts
                      </DropdownMenuItem>
                      {managed ? (
                        <>
                          <DropdownMenuItem onSelect={() => update.mutate(pack)}>
                            <RefreshCwIcon aria-hidden="true" /> Check for update
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setDeletePack(pack)}
                            variant="destructive"
                          >
                            <Trash2Icon aria-hidden="true" /> Remove
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </ClioInteractiveRow>
            );
          })}
          {!packs.isPending && !packs.data?.length ? (
            <div className="grid place-items-center gap-2 rounded-lg border p-10 text-center">
              <BoxesIcon aria-hidden="true" className="size-6 text-muted-foreground" />
              <p className="font-medium">No expert packs are installed</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Add a marketplace, then install a pack for every workspace or one selected project.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/settings/blueprints">Manage marketplaces</Link>
              </Button>
            </div>
          ) : null}
          {packs.error ? (
            <Alert variant="destructive">
              <AlertTitle>Expert packs unavailable</AlertTitle>
              <AlertDescription>{packs.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>

      <Frame className="min-w-0" spacing="lg">
        <FrameHeader className="min-w-0 gap-4 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <FrameTitle>Available from marketplaces</FrameTitle>
            <FrameDescription className="mt-1">
              Install only packs that passed validation at the source.
            </FrameDescription>
          </div>
          <FieldGroup
            className={`w-full min-w-0 gap-3 md:shrink-0 md:flex-row ${
              scope === 'workspace' ? 'md:w-[25.75rem]' : 'md:w-[11rem]'
            }`}
          >
            <Field className="md:w-[11rem] md:shrink-0">
              <FieldLabel htmlFor="expert-pack-scope">Install for</FieldLabel>
              <Select onValueChange={(value) => setScope(value as InstallScope)} value={scope}>
                <SelectTrigger id="expert-pack-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Every workspace</SelectItem>
                  <SelectItem value="workspace">One workspace</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {scope === 'workspace' ? (
              <Field className="md:w-[14rem] md:shrink-0">
                <FieldLabel htmlFor="expert-pack-target-workspace">Workspace</FieldLabel>
                <Select onValueChange={setWorkspacePreference} value={workspaceId}>
                  <SelectTrigger id="expert-pack-target-workspace">
                    <SelectValue placeholder="Choose a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.data?.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspaceTitle(workspace)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Only this workspace can activate it.</FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>
        </FrameHeader>
        <FramePanel className="grid gap-2 p-2">
          {availablePacks.map((candidate) => (
            <ClioInteractiveRow key={`${candidate.source.id}:${candidate.id}`}>
              <div className="flex items-start gap-3">
                <PackagePlusIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{candidate.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {candidate.source.name}, {candidate.version || 'Version unavailable'}
                  </p>
                  {candidate.validationErrors.length ? (
                    <p className="mt-2 text-xs text-destructive">
                      {candidate.validationErrors.join(', ')}
                    </p>
                  ) : null}
                </div>
                {installedIds.has(candidate.id) ? (
                  <Badge variant="secondary">Installed</Badge>
                ) : (
                  <Button
                    disabled={
                      !candidate.enabled ||
                      install.isPending ||
                      (scope === 'workspace' && !workspaceId)
                    }
                    onClick={() => install.mutate(candidate)}
                    size="sm"
                    variant="outline"
                  >
                    Install
                  </Button>
                )}
              </div>
            </ClioInteractiveRow>
          ))}
          {!sources.isPending && !availablePacks.length ? (
            <p className="p-5 text-sm text-muted-foreground">
              Connected marketplaces currently report no expert packs.
            </p>
          ) : null}
          {sources.error ? (
            <Alert variant="destructive">
              <AlertTitle>Marketplace packs unavailable</AlertTitle>
              <AlertDescription>{sources.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>

      <Dialog onOpenChange={(open) => !open && setDetailPack(undefined)} open={Boolean(detailPack)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailPack ? packTitle(detailPack) : 'Expert pack'}</DialogTitle>
            <DialogDescription>
              Specialist agents and validation reported by the connected service.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {details.data?.agents.map((agent) => (
              <ClioInteractiveRow key={agent.id}>
                <div className="flex items-start gap-3">
                  <UsersIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{agent.title}</p>
                      <ClioStatus
                        label={agent.enabled ? 'Ready' : 'Needs attention'}
                        value={agent.enabled ? 'healthy' : 'degraded'}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {agent.description || 'No description provided.'}
                    </p>
                  </div>
                </div>
              </ClioInteractiveRow>
            ))}
            {!details.isPending && !details.data?.agents.length ? (
              <p className="p-5 text-sm text-muted-foreground">No experts were reported.</p>
            ) : null}
            {details.error ? (
              <Alert variant="destructive">
                <AlertTitle>Pack details unavailable</AlertTitle>
                <AlertDescription>{details.error.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setDeletePack(undefined)}
        open={Boolean(deletePack)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {deletePack ? packTitle(deletePack) : 'expert pack'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sessions already using this pack may lose access to its specialist agents and tools.
              The marketplace remains connected so you can install it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePack && remove.mutate(deletePack)}
              variant="destructive"
            >
              Remove expert pack
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
