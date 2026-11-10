import type { InfrastructureOperation, ModelAcquisition } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpCircleIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PackageIcon,
  PlayIcon,
  SquareIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { copyText } from '@/lib/clipboard';
import { CloseIcon, DeleteIcon, RefreshIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ModelDownloadProgress } from './model-download-progress';
import {
  operationDetail,
  serviceObservationSummary,
} from './infrastructure-operation-presentation';
import { InfraProgress, InfraRow, type InfraStatus } from './infrastructure-row';
import { InfraRowChevron, InfraRowToggle, InfraRowActions } from './infrastructure-row-toggle';
import { InfraRowMenu } from './infrastructure-row-menu';
import { IconButton } from './primitives/icon-button';
import { StatusIndicator } from './primitives/status-indicator';
import { StateView } from './primitives/state-view';
import { ClioRelativeTime } from './relative-time';

export interface InfrastructureActivityItem {
  id: string;
  target: string;
  title: string;
  state: string;
  time: number;
  detail?: string;
  logs?: string;
  model?: ModelAcquisition;
  operation?: InfrastructureOperation;
}

const STATE_TONES: Record<string, InfraStatus['tone']> = {
  running: 'running',
  queued: 'idle',
  failed: 'error',
  succeeded: 'success',
  ready: 'success',
  cancelled: 'idle',
  removed: 'idle',
  pending: 'idle',
  reused: 'success',
  skipped: 'idle',
};

const ACTION_ICONS: Record<string, ReactNode> = {
  install: <PackageIcon />,
  start: <PlayIcon />,
  stop: <SquareIcon />,
  restart: <RefreshIcon />,
  update: <ArrowUpCircleIcon />,
  upgrade: <ArrowUpCircleIcon />,
  remove: <DeleteIcon />,
  uninstall: <DeleteIcon />,
};

// The spec's quiet text link under an opened row's log (.lnk): muted words, no outline.
const QUIET_ACTION =
  'inline-flex h-6 shrink-0 items-center gap-[5px] rounded-[5px] px-1.5 text-[12px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-3.5';

/**
 * One operation in the timeline: what ran, where, its state and when. Opening
 * it shows the outcome line and the log; the full record opens in a dialog.
 */
export function InfrastructureActivityRow({
  row,
  host,
  status,
}: {
  row: InfrastructureActivityItem;
  host: string;
  status: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const active = row.state === 'queued' || row.state === 'running';
  const failed = row.state === 'failed';
  const title = row.title.charAt(0).toLocaleUpperCase() + row.title.slice(1);
  const detail = operationDetail(row.detail, status);
  const outcome = failed
    ? detail || serviceObservationSummary(row.logs)
    : serviceObservationSummary(row.logs) || detail;
  const destination = `/infrastructure/${row.model ? 'models' : 'services'}?target=${encodeURIComponent(row.target)}`;
  const longDetail = row.detail && row.detail.length > 320 ? row.detail : undefined;
  const raw =
    [longDetail, row.logs]
      .filter((text, index, all) => text && all.indexOf(text) === index)
      .join('\n\n') ||
    row.detail ||
    '';
  const inlineLog = row.logs?.trim() || longDetail;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['infrastructure-inventory', settings.endpoint] });
  const act = useMutation({
    mutationFn: async (action: 'retry' | 'cancel'): Promise<unknown> =>
      row.model
        ? repository.modelAcquisitionAction(row.target, row.model.id, action)
        : repository.cancelInfrastructureOperation(row.id),
    onSettled: refresh,
  });
  const canCancel = active && Boolean(row.model || row.operation);
  const canRetry = failed && Boolean(row.model);
  const total =
    row.model?.bytes_total && row.model.bytes_total > 0 ? row.model.bytes_total : undefined;
  const meta =
    row.model && active && total ? (
      <InfraProgress
        label={`Downloaded bytes for ${row.model.repository}`}
        value={(row.model.bytes_done / total) * 100}
      />
    ) : Number.isFinite(row.time) ? (
      <ClioRelativeTime
        className="text-[11px] text-muted-foreground"
        compact
        label="Updated"
        timestamp={new Date(row.time).toISOString()}
      />
    ) : undefined;

  return (
    <>
      <InfraRow
        className="cursor-pointer"
        description={`${host}, ${row.model ? 'Models' : 'Services'}`}
        icon={row.model ? <DownloadIcon /> : (ACTION_ICONS[actionOf(row)] ?? <WrenchIcon />)}
        meta={meta}
        onClick={() => setExpanded((value) => !value)}
        status={{ tone: STATE_TONES[row.state] ?? 'idle', label: status }}
        title={
          <InfraRowToggle expanded={expanded} label={`${title} details`}>
            {title}
          </InfraRowToggle>
        }
        actions={
          <InfraRowMenu
            actions={
              raw
                ? [
                    {
                      icon: <CopyIcon />,
                      label: `Copy log for ${title}`,
                      onSelect: () => void copyText(raw),
                    },
                  ]
                : []
            }
            label={`More for ${title}`}
          />
        }
        primaryAction={
          canCancel ? (
            <InfraRowActions>
              <IconButton
                disabled={act.isPending}
                icon={
                  act.isPending ? (
                    <LoaderCircleIcon className="motion-safe:animate-spin" />
                  ) : (
                    <CloseIcon />
                  )
                }
                label={`Cancel ${title}`}
                onClick={() => act.mutate('cancel')}
                size="sm"
              />
            </InfraRowActions>
          ) : canRetry ? (
            <InfraRowActions>
              <IconButton
                disabled={act.isPending}
                icon={
                  act.isPending ? (
                    <LoaderCircleIcon className="motion-safe:animate-spin" />
                  ) : (
                    <RetryIcon />
                  )
                }
                label={`Retry ${title}`}
                onClick={() => act.mutate('retry')}
                size="sm"
              />
            </InfraRowActions>
          ) : (
            <InfraRowChevron expanded={expanded} />
          )
        }
        details={
          expanded ? (
            <>
              {outcome ? (
                <p
                  className={
                    failed
                      ? 'flex min-w-0 items-start gap-1.5 text-[12px] text-destructive'
                      : 'min-w-0 text-[12px] text-muted-foreground'
                  }
                >
                  {failed ? (
                    <TriangleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                  ) : null}
                  <span className="min-w-0 [overflow-wrap:anywhere]">{outcome}</span>
                </p>
              ) : null}
              {row.model && active ? <ModelDownloadProgress model={row.model} /> : null}
              {inlineLog ? (
                <pre
                  aria-label={`Log for ${title}`}
                  className="clio-scrollbar max-h-48 overflow-auto rounded-md bg-muted/50 px-3 py-2 font-mono text-[11.5px] leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]"
                  tabIndex={0}
                >
                  {inlineLog}
                </pre>
              ) : null}
              {act.error ? (
                <StateView
                  kind="error"
                  size="row"
                  title={act.error instanceof Error ? act.error.message : String(act.error)}
                  action={{ label: 'Dismiss', onClick: () => act.reset() }}
                />
              ) : null}
              <div className="-ml-1.5 flex min-w-0 gap-0.5">
                <button className={QUIET_ACTION} onClick={() => setOpen(true)} type="button">
                  View operation
                </button>
                <Link className={QUIET_ACTION} to={destination}>
                  <ExternalLinkIcon aria-hidden="true" />
                  {row.model ? 'Go to models' : 'Go to service'}
                </Link>
              </div>
            </>
          ) : undefined
        }
      />
      <ActivityOperationDialog
        host={host}
        longDetail={longDetail}
        onOpenChange={setOpen}
        open={open}
        outcome={outcome}
        raw={raw}
        row={row}
        status={status}
        title={title}
      />
    </>
  );
}

function actionOf(row: InfrastructureActivityItem): string {
  return (row.operation?.action ?? '').toLocaleLowerCase();
}

function ActivityOperationDialog({
  row,
  host,
  status,
  title,
  outcome,
  raw,
  longDetail,
  open,
  onOpenChange,
}: {
  row: InfrastructureActivityItem;
  host: string;
  status: string;
  title: string;
  outcome?: string;
  raw: string;
  longDetail?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {host}, {new Date(row.time).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="summary" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3">
            <StatusIndicator label={status} tone={STATE_TONES[row.state] ?? 'idle'} />
            {outcome ? <p className="text-sm leading-6">{outcome}</p> : null}
            {row.model ? <ModelDownloadProgress model={row.model} /> : null}
            {row.operation?.steps.length ? (
              <ol className="space-y-3">
                {row.operation.steps.map((step) => (
                  <li key={step.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium" title={step.label}>
                        {step.id === 'inspect'
                          ? 'Inspect computer'
                          : step.id.startsWith('command-') && step.label.startsWith('Run ')
                            ? title
                            : step.label}
                      </span>
                      <StatusIndicator
                        label={step.state.replaceAll('_', ' ')}
                        tone={STATE_TONES[step.state] ?? 'idle'}
                      />
                    </div>
                    {['failed', 'running'].includes(step.state) &&
                    step.message &&
                    step.message !== step.label ? (
                      <p className="text-muted-foreground">{step.message}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {row.operation?.elapsed_seconds != null ? (
              <p className="text-sm text-muted-foreground">
                Duration: {row.operation.elapsed_seconds.toFixed(1)} seconds
              </p>
            ) : null}
          </TabsContent>
          <TabsContent value="log" className="flex min-h-0 flex-1 flex-col gap-3 py-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyText(raw)}
                disabled={!raw}
              >
                <CopyIcon aria-hidden="true" />
                Copy log
              </Button>
            </div>
            {raw ? (
              <div className="min-h-0 flex-1 space-y-4 overflow-auto">
                {longDetail ? (
                  <pre className="rounded-md bg-muted/40 p-4 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {longDetail}
                  </pre>
                ) : null}
                {row.logs ? (
                  <pre className="rounded-md bg-muted/40 p-4 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {row.logs}
                  </pre>
                ) : !longDetail ? (
                  <pre className="rounded-md bg-muted/40 p-4 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {raw}
                  </pre>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No log was recorded for this operation.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
