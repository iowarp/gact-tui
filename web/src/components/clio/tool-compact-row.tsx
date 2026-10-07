import type { ToolInvocation } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { CheckIcon, ChevronRightIcon, CircleAlertIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogTrigger } from '@/components/ui/dialog';
import {
  getToolActionLabel,
  getToolHeaderMetadata,
  getToolStatus,
  getToolSubject,
  getToolSummary,
} from './tool-presentation';

/** One recorded call occupies one line; its dialog owns the complete result. */
export function ToolCompactRow({
  tool,
  attention,
}: {
  tool: ToolInvocation;
  attention?: ReactNode;
}) {
  const status = getToolStatus(tool);
  const active = status === 'pending' || status === 'running';
  const success = status === 'succeeded';
  const action = getToolActionLabel(tool);
  const subject = getToolSubject(tool);
  const terminal = tool.presentation?.blocks.find((block) => block.type === 'terminal');
  const detail = subject?.label || subject?.text || terminal?.command;
  const metadata =
    terminal?.exit_code !== undefined && terminal.exit_code !== null
      ? `exit ${terminal.exit_code}`
      : getToolHeaderMetadata(tool) || getToolSummary(tool);
  return (
    <DialogTrigger asChild>
      <Button
        variant="ghost"
        aria-label={`Technical details for ${action}`}
        title={[action, detail, metadata].filter(Boolean).join(' · ')}
        className="h-auto min-h-7 w-full min-w-0 justify-start gap-2 rounded-sm px-1 py-1 text-xs font-normal"
      >
        {active ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin text-primary"
          />
        ) : success ? (
          <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
        ) : (
          <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />
        )}
        <span className="min-w-0 max-w-[48%] shrink truncate font-medium">{action}</span>
        {detail ? (
          <span className="min-w-0 flex-1 truncate text-left font-mono">{detail}</span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {metadata ? (
          <span className="min-w-0 max-w-[35%] truncate text-muted-foreground">{metadata}</span>
        ) : null}
        {!active && !success ? <span className="shrink-0 text-destructive">{status}</span> : null}
        {attention}
        <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      </Button>
    </DialogTrigger>
  );
}
