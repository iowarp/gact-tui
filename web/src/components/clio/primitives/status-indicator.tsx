import { memo } from 'react';
import { cn } from '@/lib/utils';

export type StatusTone =
  | 'running'
  | 'waiting'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'idle'
  | 'stopped';

/**
 * Shape as well as color, so the mark never relies on color alone: a spinner
 * for work in progress, a hollow ring for idle, a square for stopped, a dot
 * for an outcome. A label always goes with it.
 */
const MARK: Record<StatusTone, string> = {
  running:
    'size-[11px] rounded-full border-[1.5px] border-primary border-t-transparent motion-safe:animate-spin',
  waiting: 'size-1.5 rounded-full bg-action ring-2 ring-action/25',
  success: 'size-1.5 rounded-full bg-success',
  warning: 'size-1.5 rounded-full bg-warning',
  error: 'size-1.5 rounded-full bg-destructive',
  info: 'size-1.5 rounded-full bg-info',
  idle: 'size-1.5 rounded-full border border-faint',
  stopped: 'size-1.5 rounded-[1px] bg-muted-foreground',
};

export interface StatusIndicatorProps {
  tone: StatusTone;
  /** What the state is, in words ("Running", "Needs you"). Always required. */
  label: string;
  /**
   * `visible` shows the label beside the mark. `column` shows only the mark in
   * a fixed 16px status column; the label becomes its accessible name and
   * hover name, and the row must also say the state (a badge or the elapsed
   * time) so it is never color alone.
   */
  display?: 'visible' | 'column';
  className?: string;
}

/** A status mark with its words; aligns in a fixed column across rows. */
export const StatusIndicator = memo(function StatusIndicator({
  tone,
  label,
  display = 'visible',
  className,
}: StatusIndicatorProps) {
  const mark = (
    <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
      <span className={cn('block', MARK[tone])} />
    </span>
  );
  if (display === 'column') {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        data-slot="status-indicator"
        data-tone={tone}
        className={cn('inline-grid size-4 shrink-0 place-items-center', className)}
      >
        {mark}
      </span>
    );
  }
  return (
    <span
      data-slot="status-indicator"
      data-tone={tone}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-[12px] whitespace-nowrap text-muted-foreground',
        tone === 'error' && 'text-destructive',
        tone === 'warning' && 'text-warning',
        className,
      )}
    >
      {mark}
      <span className="truncate">{label}</span>
    </span>
  );
});
