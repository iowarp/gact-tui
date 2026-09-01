// Source-owned from usetheokit/theokit-ui@64f737bb15c9ae87ff233a1ef838c96fdaf071cc.
// CLIO retains its composition while adapting tokens, density, and labeled duration semantics.
import { Bot, Clock3, CornerDownRight, Loader2 } from 'lucide-react';
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SubAgentState =
  | 'spawning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'unknown';

export interface TheoSubAgentRun {
  id: string;
  agent: string;
  task: string;
  state: SubAgentState;
  duration?: string;
  lastEvent?: string;
  result?: ReactNode;
}

interface SubAgentDispatchProps extends HTMLAttributes<HTMLElement> {
  run: TheoSubAgentRun;
  onCancel?: (id: string) => void;
}

const STATE_CONFIG: Record<SubAgentState, { label: string; class: string }> = {
  spawning: {
    label: 'Starting',
    class: 'border-primary/40 bg-primary/10 text-primary',
  },
  running: { label: 'Running', class: 'border-info/40 bg-info/10 text-info-foreground' },
  completed: { label: 'Completed', class: 'border-success/40 bg-success/10 text-success' },
  failed: { label: 'Failed', class: 'border-destructive/40 bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', class: 'border-border bg-muted text-muted-foreground' },
  interrupted: { label: 'Interrupted', class: 'border-warning/40 bg-warning/10 text-warning' },
  unknown: { label: 'Unknown', class: 'border-warning/40 bg-warning/10 text-warning' },
};

const SubAgentDispatch = forwardRef<HTMLElement, SubAgentDispatchProps>(
  ({ className, run, onCancel, ...props }, ref) => {
    const cfg = STATE_CONFIG[run.state];
    const isLive = run.state === 'spawning' || run.state === 'running';
    return (
      <article
        className={cn(
          'grid gap-1.5 rounded-lg border border-primary/30 border-l-2 border-l-primary bg-card px-3 py-2.5',
          className,
        )}
        data-slot="sub-agent-dispatch"
        ref={ref}
        {...props}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            <Bot aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium text-foreground">{run.agent}</span>
            {run.duration ? (
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground tabular-nums">
                <Clock3 aria-hidden="true" className="size-3" />
                {run.duration}
              </span>
            ) : null}
          </div>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium',
              cfg.class,
            )}
          >
            {isLive ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : null}
            {cfg.label}
          </span>
        </header>

        <p className="line-clamp-3 text-sm leading-5 text-foreground">
          <span className="mr-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Assignment
          </span>
          {run.task}
        </p>

        {run.lastEvent ? (
          <p className="truncate text-xs text-muted-foreground">{run.lastEvent}</p>
        ) : null}

        {run.result ? (
          <div className="line-clamp-4 rounded-md bg-muted/40 px-3 py-2 text-sm leading-5 text-foreground">
            <span className="mr-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Result
            </span>
            {run.result}
          </div>
        ) : null}

        {isLive && onCancel ? (
          <footer className="flex justify-end">
            <button
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onCancel(run.id)}
              type="button"
            >
              Cancel
            </button>
          </footer>
        ) : null}
      </article>
    );
  },
);
SubAgentDispatch.displayName = 'SubAgentDispatch';

export { SubAgentDispatch };
