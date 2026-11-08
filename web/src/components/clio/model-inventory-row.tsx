import type { ModelAcquisition } from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DeleteIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { registryModelTags } from '@/lib/registry-model-tags';
import { displayedTags } from '@/lib/model-capability-tags';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ModelCapabilityTags } from './model-capability-tags';
import { RegistryModelDetails } from './registry-model-details';
import { ModelDownloadProgress } from './model-download-progress';

/** One compact model row with a clickable card, capability chips and explicit file actions. */
export function ModelInventoryRow({
  model,
  targetId,
  hostLabel,
  runtimeUnavailable,
  disabled,
  onAction,
  onRefresh,
}: {
  model: ModelAcquisition;
  targetId: string;
  hostLabel: string;
  runtimeUnavailable?: string;
  disabled: boolean;
  onAction: (action: 'retry' | 'cancel') => void;
  onRefresh: () => Promise<void>;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const active = model.state === 'queued' || model.state === 'running';
  const shared = model.origin === 'hf_cache';
  const metadata = useQuery({
    queryKey: ['registry-model-details', settings.endpoint, model.repository],
    queryFn: ({ signal }) => repository.modelRegistryDetails(model.repository, signal),
    enabled: model.state === 'ready',
    staleTime: 30 * 60_000,
    retry: false,
  });
  const remove = useMutation({
    mutationFn: () => repository.modelAcquisitionAction(targetId, model.id, 'remove'),
    onSuccess: async () => {
      setRemoveOpen(false);
      await onRefresh();
    },
  });
  return (
    <article className="@container py-3">
      <div className="flex min-w-0 items-center gap-3 whitespace-nowrap">
        <Button
          variant="link"
          className="h-auto min-w-0 shrink justify-start p-0 text-left font-medium text-foreground"
          onClick={() => setDetailsOpen(true)}
          title={model.repository}
        >
          <span className="truncate">{model.repository}</span>
        </Button>
        {metadata.data ? (
          <div className="hidden min-w-0 overflow-hidden @4xl:flex">
            <ModelCapabilityTags size="sm" tags={displayedTags(registryModelTags(metadata.data))} />
          </div>
        ) : null}
        <Badge className="shrink-0" variant="outline">
          {model.state === 'ready' ? (shared ? 'Shared cache' : 'Ready') : model.state}
        </Badge>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {active ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onAction('cancel')}
            >
              Cancel
            </Button>
          ) : model.state === 'ready' && runtimeUnavailable ? (
            <Button variant="outline" size="sm" disabled title={runtimeUnavailable}>
              Runtime unavailable
            </Button>
          ) : model.state === 'ready' ? (
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/infrastructure/services?target=${encodeURIComponent(targetId)}&model=${encodeURIComponent(model.id)}`}
              >
                Set up runtime
              </Link>
            </Button>
          ) : !shared ? (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onAction('retry')}
            >
              Retry
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${model.repository}`}>
                <MoreIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                Model card and download details
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={active || shared || disabled}
                onSelect={() => {
                  remove.reset();
                  setRemoveOpen(true);
                }}
              >
                <DeleteIcon /> Delete model files...
              </DropdownMenuItem>
              {shared ? (
                <p className="max-w-60 px-2 py-1.5 text-xs text-muted-foreground">
                  This shared cache is managed outside {vocab.agent}.
                </p>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {runtimeUnavailable && model.state === 'ready' ? (
        <p className="mt-2 text-xs text-muted-foreground">{runtimeUnavailable}</p>
      ) : null}
      {active ? (
        <div className="mt-3">
          <ModelDownloadProgress model={model} />
        </div>
      ) : model.error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {model.error}
        </p>
      ) : null}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="break-all">{model.repository}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 overflow-y-auto pr-1">
            <RegistryModelDetails repository={model.repository} />
            <details className="border-t pt-4">
              <summary className="cursor-pointer text-sm font-medium">Download details</summary>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[7rem_1fr]">
                <dt>Revision</dt>
                <dd className="break-all font-mono text-xs">
                  {model.revision || 'Not resolved yet'}
                </dd>
                <dt>Folder</dt>
                <dd className="break-all text-xs">{model.destination}</dd>
                <dt>Last checked</dt>
                <dd>{new Date((model.observed_at ?? model.updated_at) * 1000).toLocaleString()}</dd>
              </dl>
            </details>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!remove.isPending) setRemoveOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {model.repository} files?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes this download from {hostLabel} and frees its model files. You can
              download it again. The operation receipt is retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all text-xs text-muted-foreground">{model.destination}</p>
          {remove.error ? (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep model</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? 'Deleting files...' : 'Delete model files'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
