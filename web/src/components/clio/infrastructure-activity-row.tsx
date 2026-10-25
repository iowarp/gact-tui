import type { InfrastructureOperation, ModelAcquisition } from '@clio/core/v3';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EllipsisIcon, ExternalLinkIcon, CopyIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { copyText } from '@/lib/clipboard';
import { ModelDownloadProgress } from './model-download-progress';
import {
  operationDetail,
  serviceObservationSummary,
} from './infrastructure-operation-presentation';

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

/** An operation opens in its own inspector; the timeline keeps one status and coherent actions. */
export function InfrastructureActivityRow({
  row,
  host,
  status,
}: {
  row: InfrastructureActivityItem;
  host: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const active = row.state === 'queued' || row.state === 'running';
  const title = row.title.charAt(0).toLocaleUpperCase() + row.title.slice(1);
  const detail = operationDetail(row.detail, status);
  const outcome =
    row.state === 'failed'
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
  return (
    <>
      <article className="py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-sm font-medium hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`View operation: ${title}`}
            onClick={() => setOpen(true)}
          >
            {title}
          </button>
          <span className="text-xs text-muted-foreground">{host}</span>
          <Badge variant={row.state === 'failed' ? 'destructive' : 'outline'}>{status}</Badge>
          <time
            className="text-xs text-muted-foreground"
            dateTime={new Date(row.time).toISOString()}
            title={new Date(row.time).toLocaleString()}
          >
            {new Date(row.time).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </time>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`}>
                <EllipsisIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setOpen(true)}>View operation</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={destination}>
                  <ExternalLinkIcon aria-hidden="true" />
                  {row.model ? 'Go to models' : 'Go to service'}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {row.model && active ? (
          <div className="mt-2">
            <ModelDownloadProgress model={row.model} />
          </div>
        ) : outcome ? (
          <p className="mt-2 text-sm text-muted-foreground">{outcome}</p>
        ) : null}
      </article>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {host} · {new Date(row.time).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="summary" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="log">Log</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3">
              <Badge variant={row.state === 'failed' ? 'destructive' : 'outline'}>{status}</Badge>
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
                        <span className="text-xs text-muted-foreground">
                          {step.state.replaceAll('_', ' ')}
                        </span>
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
    </>
  );
}
