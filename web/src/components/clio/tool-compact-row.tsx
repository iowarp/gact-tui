import type { ToolInvocation } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  OctagonIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  getToolActionLabel,
  getToolFailureDetail,
  getToolStatus,
  getToolInterruptionDetail,
} from './tool-presentation';
import { PresentationLink } from './presentation-link';
import type { ToolOperation } from './tool-operation';
import { clioStatusLabel } from './status';

/** One operation row with separately reachable entity links and disclosure controls. */
export function ToolCompactRow({
  tool,
  operation,
  attention,
  duration,
  expanded,
  surface = 'transcript',
  onOpenFlow,
}: {
  tool: ToolInvocation;
  operation: ToolOperation;
  attention?: ReactNode;
  duration?: number;
  expanded: boolean;
  surface?: 'transcript' | 'evidence';
  onOpenFlow?: () => void;
}) {
  const status = getToolStatus(tool);
  const active = status === 'pending' || status === 'running';
  const success = status === 'succeeded';
  const interrupted = status === 'interrupted';
  const failure =
    (interrupted ? getToolInterruptionDetail(tool) : undefined) || getToolFailureDetail(tool);
  const [tooltip, setTooltip] = useState({ failure, open: false });
  if (tooltip.failure !== failure) setTooltip({ failure, open: false });
  const action = operation.action || getToolActionLabel(tool);
  const statusIcon = interrupted ? (
    <OctagonIcon
      aria-hidden="true"
      data-slot="tool-interrupted-mark"
      className="size-3.5 shrink-0 text-warning"
    />
  ) : active ? (
    <LoaderCircleIcon
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin text-muted-foreground"
    />
  ) : success ? (
    <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
  ) : (
    <CircleAlertIcon
      aria-hidden="true"
      className={cn(
        'size-3.5 shrink-0',
        status === 'unknown' || status === 'degraded' ? 'text-warning' : 'text-destructive',
      )}
    />
  );
  const row = (
    <div
      data-slot="activity-row"
      className={cn(
        'group/tool-trigger flex min-h-8 min-w-0 flex-1 items-start gap-2 rounded-sm px-1 py-1 text-sm max-sm:flex-wrap',
        surface === 'evidence' && 'px-2 py-2',
      )}
    >
      <span
        className="mt-1 shrink-0"
        role="status"
        aria-label={interrupted ? failure || clioStatusLabel(status) : clioStatusLabel(status)}
        title={failure || clioStatusLabel(status)}
      >
        {statusIcon}
      </span>
      <div
        data-slot="tool-action-label"
        className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            disabled={!operation.expandable}
            aria-label={`Show result for ${action}`}
            data-slot="tool-action-text"
            className="h-auto min-w-0 justify-start whitespace-normal p-0 text-left text-sm font-medium disabled:opacity-100 [overflow-wrap:anywhere]"
          >
            {action}
          </Button>
        </CollapsibleTrigger>
        {operation.subjects.map((subject, index) => (
          <span
            className="inline-flex min-w-0 max-w-full items-center gap-1.5"
            key={`${subject.id}-${index}`}
          >
            {index && index === operation.subjects.length - 1 ? <span>and</span> : null}
            {onOpenFlow && index === 0 ? (
              <Button
                variant="link"
                className="h-auto max-w-full truncate p-0 text-sm"
                onClick={onOpenFlow}
              >
                {subject.label || subject.text}
              </Button>
            ) : subject.type === 'link' ? (
              <PresentationLink block={subject} compact />
            ) : (
              <span
                className={cn(
                  '[overflow-wrap:anywhere]',
                  // A command reads as code, as it does in its terminal block.
                  subject.id === 'operation-command' && 'font-mono text-[0.8125rem]',
                )}
              >
                {subject.label || subject.text}
              </span>
            )}
            {/* A list's comma stays against its name, so a wrap never starts with one. */}
            {index < operation.subjects.length - 2 ? <span className="-ml-1.5">,</span> : null}
          </span>
        ))}
        {operation.qualifier ? (
          <span className="[overflow-wrap:anywhere]">{operation.qualifier}</span>
        ) : null}
        {operation.metadata ? (
          <span
            data-slot="activity-metadata"
            className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]"
          >
            {/^(?:rejected|unavailable|denied)/iu.test(operation.metadata)
              ? operation.metadata
              : `(${operation.metadata})`}
          </span>
        ) : null}
      </div>
      {/* On a phone the outcome and marks take their own line under the row, so a long
          command keeps the row's width. */}
      <span className="flex shrink-0 items-start gap-2 empty:hidden max-sm:order-last max-sm:basis-full max-sm:pl-5.5">
        {/* A failure is named in words, not only by its mark's colour; success stays quiet and a
            partial outcome is counted in words by the operation's own metadata. */}
        {!active && !success && !interrupted && !(status === 'degraded' && operation.metadata) ? (
          <span
            data-slot="tool-outcome"
            className={cn(
              'mt-0.5 shrink-0 text-xs',
              status === 'unknown' || status === 'degraded' ? 'text-warning' : 'text-destructive',
            )}
          >
            {status === 'unknown' ? 'Unknown' : status}
          </span>
        ) : null}
        {attention}
      </span>
      {duration !== undefined ? (
        <span
          className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground max-sm:hidden"
          data-slot="tool-duration"
          title={active ? 'Elapsed time; updates while running' : 'Execution time'}
        >
          {formatDuration(duration, 'tenths')}
        </span>
      ) : null}
      {operation.expandable ? (
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-5 shrink-0"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${action}`}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn('size-3 text-muted-foreground', expanded && 'rotate-90')}
            />
          </Button>
        </CollapsibleTrigger>
      ) : null}
    </div>
  );
  return (
    <TooltipProvider>
      <Tooltip
        open={Boolean(failure) && tooltip.failure === failure && tooltip.open}
        onOpenChange={(open) => setTooltip({ failure, open: Boolean(failure) && open })}
      >
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        {failure ? (
          <TooltipContent className="max-w-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
            {failure.length > 1200 ? `${failure.slice(0, 1200)}…` : failure}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}
