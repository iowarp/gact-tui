import type { ModelAcquisition } from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  FolderIcon,
  GitBranchIcon,
  RocketIcon,
  SmileIcon,
} from 'lucide-react';
import { CloseIcon, DeleteIcon, InfoIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { formatBytes } from '@/lib/format';
import { registryModelTags } from '@/lib/registry-model-tags';
import { displayedTags } from '@/lib/model-capability-tags';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
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
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { StateView } from './primitives/state-view';
import { InfraProgress, InfraRow, type InfraStatus } from './infrastructure-row';
import { ClioRelativeTime } from './relative-time';
import { TechnicalDetails } from './technical-details';
import { ModelCapabilityTags } from './model-capability-tags';
import { RegistryModelDetails } from './registry-model-details';

/** The words and mark for a download's state; never the colour alone. */
function modelStatus(model: ModelAcquisition, runtimeUnavailable?: string): InfraStatus {
  switch (model.state) {
    case 'queued':
      return { tone: 'waiting', label: 'Queued' };
    case 'running':
      return { tone: 'running', label: 'Downloading' };
    case 'ready':
      return runtimeUnavailable
        ? { tone: 'warning', label: 'Runtime unavailable' }
        : { tone: 'success', label: 'Ready' };
    case 'failed':
      return { tone: 'error', label: 'Failed' };
    case 'cancelled':
      return { tone: 'stopped', label: 'Cancelled' };
    case 'interrupted':
      return { tone: 'warning', label: 'Interrupted' };
    case 'stale':
      return { tone: 'warning', label: 'Stale' };
    case 'removed':
      return { tone: 'idle', label: 'Removed' };
  }
}

function modelSize(model: ModelAcquisition) {
  if (model.bytes_total && model.bytes_total > 0) return model.bytes_total;
  return model.bytes_done > 0 ? model.bytes_done : undefined;
}

/**
 * One downloaded model: name over its revision and size, fixed status and
 * runtime columns, a progress bar while downloading, and its facts under the
 * row when expanded.
 */
export function ModelInventoryRow({
  model,
  targetId,
  hostLabel,
  runtime,
  runtimeUnavailable,
  disabled,
  onAction,
  onRefresh,
}: {
  model: ModelAcquisition;
  targetId: string;
  hostLabel: string;
  /** The runtime that can serve these files, or the one it would need. */
  runtime?: string;
  runtimeUnavailable?: string;
  disabled: boolean;
  onAction: (action: 'retry' | 'cancel') => void;
  onRefresh: () => Promise<void>;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [expanded, setExpanded] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const active = model.state === 'queued' || model.state === 'running';
  const ready = model.state === 'ready';
  const shared = model.origin === 'hf_cache';
  const retryable = !active && !ready && !shared;
  const metadata = useQuery({
    queryKey: ['registry-model-details', settings.endpoint, model.repository],
    queryFn: ({ signal }) => repository.modelRegistryDetails(model.repository, signal),
    enabled: ready && expanded,
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
  const size = modelSize(model);
  const description =
    model.error && !active && !ready
      ? model.error
      : [model.requested_revision, size ? formatBytes(size) : undefined].filter(Boolean).join(', ');
  const total = model.bytes_total && model.bytes_total > 0 ? model.bytes_total : undefined;
  const meta: ReactNode = active ? (
    total ? (
      <InfraProgress
        label={`Download progress for ${model.repository}`}
        value={(model.bytes_done / total) * 100}
      />
    ) : model.bytes_done > 0 ? (
      formatBytes(model.bytes_done)
    ) : (
      'Preparing'
    )
  ) : shared && ready ? (
    'Shared cache'
  ) : ready ? (
    runtime
  ) : undefined;
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const primaryAction = active ? (
    <IconButton
      disabled={disabled}
      icon={<CloseIcon />}
      label="Cancel download"
      onClick={() => onAction('cancel')}
      size="sm"
    />
  ) : retryable ? (
    <IconButton
      disabled={disabled}
      icon={<RetryIcon />}
      label="Retry download"
      onClick={() => onAction('retry')}
      size="sm"
    />
  ) : null;
  // A ready model needs nothing; serving it is offered with the row's other actions.
  const setUpRuntime =
    ready && !runtimeUnavailable ? (
      <NamedTooltip label="Set up runtime">
        <Button
          asChild
          className="rounded-[5px] text-muted-foreground hover:bg-hover hover:text-foreground [&_svg:not([class*=size-])]:size-3.5"
          size="icon-xs"
          variant="ghost"
        >
          <Link
            aria-label="Set up runtime"
            to={`/infrastructure/services?target=${encodeURIComponent(targetId)}&model=${encodeURIComponent(model.id)}`}
          >
            <RocketIcon aria-hidden="true" />
          </Link>
        </Button>
      </NamedTooltip>
    ) : null;
  const facts: KeyValueItem[] = [
    {
      label: 'Revision',
      icon: <GitBranchIcon />,
      value: model.revision
        ? `${model.requested_revision} @ ${model.revision.slice(0, 7)}`
        : 'Not resolved yet',
      title: model.revision ?? undefined,
      mono: Boolean(model.revision),
    },
    { label: 'Folder', icon: <FolderIcon />, value: model.destination, mono: true },
    ...(active
      ? [
          { label: 'Phase', icon: <DownloadIcon />, value: model.phase },
          {
            label: 'Downloaded',
            icon: <DatabaseIcon />,
            value: total
              ? `${formatBytes(model.bytes_done)} of ${formatBytes(total)}`
              : formatBytes(model.bytes_done),
            mono: true,
          },
        ]
      : []),
    ...(shared
      ? [
          {
            label: 'Source',
            icon: <DatabaseIcon />,
            value: `Shared cache, managed outside ${vocab.agent}`,
          },
        ]
      : []),
    ...(shared && runtime ? [{ label: 'Runtime', icon: <CpuIcon />, value: runtime }] : []),
    {
      label: 'Last checked',
      icon: <ClockIcon />,
      value: (
        <ClioRelativeTime
          className="text-[12px] text-foreground"
          compact
          label="Last checked"
          timestamp={new Date((model.observed_at ?? model.updated_at) * 1000).toISOString()}
        />
      ),
    },
  ];
  const tags = metadata.data ? displayedTags(registryModelTags(metadata.data)) : [];
  return (
    <>
      <InfraRow
        actions={
          <span className="flex items-center gap-0.5" onClick={stop} onKeyDown={stop}>
            {setUpRuntime}
            <IconButton
              aria-expanded={expanded}
              icon={<InfoIcon />}
              label={expanded ? 'Hide details' : 'Show details'}
              onClick={() => setExpanded((open) => !open)}
              size="sm"
            />
            <IconButton
              disabled={active || shared || disabled}
              icon={<DeleteIcon />}
              label="Delete model"
              onClick={() => {
                remove.reset();
                setRemoveOpen(true);
              }}
              size="sm"
            />
          </span>
        }
        className="cursor-pointer"
        description={description}
        details={
          expanded ? (
            <>
              <KeyValueGrid items={facts} />
              {tags.length ? <ModelCapabilityTags size="sm" tags={tags} /> : null}
              {ready && runtimeUnavailable ? (
                <StateView kind="unavailable" size="row" title={runtimeUnavailable} />
              ) : null}
              {model.error && !ready ? (
                <StateView
                  action={
                    retryable
                      ? { label: 'Retry download', onClick: () => onAction('retry') }
                      : undefined
                  }
                  kind="error"
                  size="row"
                  title={model.error}
                />
              ) : null}
              <div className="flex min-w-0 items-center gap-1">
                <Button onClick={() => setCardOpen(true)} size="sm" variant="ghost">
                  Model card
                </Button>
              </div>
              <TechnicalDetails className="text-[12px]" title="Technical details">
                <pre className="clio-scrollbar mt-1 max-h-60 overflow-auto font-mono text-[11px] whitespace-pre text-muted-foreground">
                  {JSON.stringify(model, null, 2)}
                </pre>
              </TechnicalDetails>
            </>
          ) : undefined
        }
        icon={<SmileIcon />}
        meta={meta}
        onClick={() => setExpanded((open) => !open)}
        primaryAction={primaryAction ? <span onClick={stop}>{primaryAction}</span> : null}
        status={modelStatus(model, runtimeUnavailable)}
        title={<span title={model.repository}>{model.repository}</span>}
      />
      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="break-all">{model.repository}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-1">
            <RegistryModelDetails repository={model.repository} />
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
          <p className="truncate font-mono text-xs text-muted-foreground" title={model.destination}>
            {model.destination}
          </p>
          {remove.error ? <StateView kind="error" size="row" title={remove.error.message} /> : null}
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
    </>
  );
}
