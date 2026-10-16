import type { ToolInvocation } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  Clock3Icon,
  LoaderCircleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  getToolActionLabel,
  getToolFailureDetail,
  getToolCompactMetadata,
  getToolStatus,
  getToolSubject,
} from './tool-presentation';

/** One recorded call occupies one line; its disclosure owns the complete result. */
export function ToolCompactRow({
  tool,
  attention,
  duration,
  expanded,
}: {
  tool: ToolInvocation;
  attention?: ReactNode;
  duration?: number;
  expanded: boolean;
}) {
  const status = getToolStatus(tool);
  const active = status === 'pending' || status === 'running';
  const success = status === 'succeeded';
  const outcomeColor = status === 'unknown' ? 'text-warning' : 'text-destructive';
  const pendingSnapshot = tool.presentation?.blocks.some(
    (block) => block.result_kind === 'snapshot' && block.status === 'pending',
  );
  const action = getToolActionLabel(tool);
  const subject = getToolSubject(tool);
  const terminal = tool.presentation?.blocks.find((block) => block.type === 'terminal');
  const detail = subject?.label || subject?.text || terminal?.command;
  const metadata = getToolCompactMetadata(tool);
  const failure = getToolFailureDetail(tool);
  const [tooltip, setTooltip] = useState({ failure, open: false });
  // Keep the trigger mounted across lifecycle changes, but discard an old reason's open state.
  if (tooltip.failure !== failure) setTooltip({ failure, open: false });
  const row = (
    <CollapsibleTrigger asChild>
      <Button
        variant="ghost"
        aria-label={`Show result for ${action}`}
        title={failure ? undefined : [action, detail, metadata].filter(Boolean).join(', ')}
        className="group/tool-trigger h-auto min-h-7 min-w-0 flex-1 shrink justify-start gap-2 rounded-sm px-1 py-1 text-xs font-normal"
      >
        {active ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin text-primary"
          />
        ) : pendingSnapshot ? (
          <Clock3Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        ) : success ? (
          <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
        ) : (
          <CircleAlertIcon aria-hidden="true" className={cn('size-3.5 shrink-0', outcomeColor)} />
        )}
        <span className="min-w-0 max-w-[48%] shrink truncate font-medium">{action}</span>
        {detail ? (
          <span className="min-w-0 flex-1 truncate text-left font-mono">{detail}</span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {metadata ? (
          <span
            className={cn(
              'min-w-0 text-muted-foreground',
              pendingSnapshot ? 'whitespace-normal text-right' : 'max-w-[35%] truncate',
            )}
          >
            {metadata}
          </span>
        ) : null}
        {!active && !success ? (
          <span className={cn('shrink-0', outcomeColor)}>
            {status === 'unknown' ? 'Unknown' : status}
          </span>
        ) : null}
        {duration !== undefined ? (
          <span
            className="shrink-0 tabular-nums text-muted-foreground"
            data-slot="tool-duration"
            title={active ? 'Elapsed time; updates while running' : 'Execution time'}
          >
            {formatDuration(duration, 'tenths')}
          </span>
        ) : null}
        {attention}
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
      </Button>
    </CollapsibleTrigger>
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
