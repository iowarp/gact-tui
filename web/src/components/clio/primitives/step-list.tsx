import { memo, type ReactNode } from 'react';
import { CheckIcon, CircleAlertIcon, CircleIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type StepState = 'done' | 'current' | 'todo' | 'failed';

export interface StepListStep {
  id: string;
  label: ReactNode;
  state: StepState;
  /** Right-aligned fact: the elapsed time of a finished step, a percentage. */
  meta?: string;
  /** 0 to 1: a bar under the step (a download). */
  progress?: number;
  /** The latest output line, under the step. */
  log?: string;
}

const STATE_WORDS: Record<StepState, string> = {
  done: 'done',
  current: 'in progress',
  todo: 'not started',
  failed: 'failed',
};

/**
 * The steps of a long operation (an update, the local startup): one 28px row
 * each, a check when done, a spinner on the current one, an open circle for
 * the rest. A bar and the latest output line can sit under a step.
 */
export const StepList = memo(function StepList({
  steps,
  label,
  className,
}: {
  steps: readonly StepListStep[];
  label: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} data-slot="step-list" className={cn('flex w-full flex-col', className)}>
      {steps.map((step) => (
        <li
          key={step.id}
          aria-current={step.state === 'current' ? 'step' : undefined}
          data-state={step.state}
          className="min-w-0"
        >
          <div
            className={cn(
              'flex h-7 min-w-0 items-center gap-2.5 text-[12.5px] whitespace-nowrap',
              step.state === 'todo' ? 'text-muted-foreground' : 'text-foreground/90',
            )}
          >
            <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center">
              {step.state === 'done' ? (
                <CheckIcon className="size-3.5 text-primary" />
              ) : step.state === 'current' ? (
                <Spinner className="size-3 text-primary motion-reduce:animate-none" />
              ) : step.state === 'failed' ? (
                <CircleAlertIcon className="size-3.5 text-destructive" />
              ) : (
                <CircleIcon className="size-3 text-faint" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {step.label}
              <span className="sr-only">, {STATE_WORDS[step.state]}</span>
            </span>
            {step.meta ? (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                {step.meta}
              </span>
            ) : null}
          </div>
          {step.progress !== undefined ? (
            <div
              aria-hidden="true"
              className="mt-0.5 mb-1.5 ml-6 h-[3px] overflow-hidden rounded-[2px] bg-muted"
            >
              <div
                className="h-full bg-primary motion-safe:transition-[width]"
                style={{ width: `${Math.round(Math.min(1, Math.max(0, step.progress)) * 100)}%` }}
              />
            </div>
          ) : null}
          {step.log ? (
            <p
              title={step.log}
              className="mt-1.5 ml-6 truncate font-mono text-[11.5px] text-muted-foreground"
            >
              {step.log}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
});
