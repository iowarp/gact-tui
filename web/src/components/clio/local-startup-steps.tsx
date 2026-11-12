import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StepList, type StepListStep } from './primitives/step-list';
import { TechnicalDetails } from './technical-details';

const STEPS = [
  { id: 'checking', label: 'Checking the local service' },
  { id: 'preparing', label: 'Preparing the local runtime and packages' },
  { id: 'starting', label: 'Starting the local service' },
  { id: 'opening', label: 'Opening the workspace' },
] as const;

interface StepClock {
  /** Milliseconds each step has been current, before the current stretch. */
  spent: Record<number, number>;
  current: number;
  /** When the current stretch began. */
  since: number;
}

/**
 * The time each step has been current, and a clock that ticks while one runs. Steps do
 * not always advance in order: the service is checked, briefly started, sent back to
 * prepare its runtime, then checked and started again. Each step is charged only for
 * the time it was the current one, so the install shows under Preparing, not under a
 * step that flashed past before or after it.
 */
function useStepClock(current: number, running: boolean) {
  const [clock, setClock] = useState<StepClock>(() => ({
    spent: {},
    current,
    since: Date.now(),
  }));
  const [now, setNow] = useState(() => Date.now());
  // A change of step is recorded in the render that first shows it.
  if (clock.current !== current)
    setClock((previous) => {
      if (previous.current === current) return previous;
      const at = Date.now();
      const spent = {
        ...previous.spent,
        [previous.current]: (previous.spent[previous.current] ?? 0) + (at - previous.since),
      };
      return { spent, current, since: at };
    });
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return { clock, now };
}

function startupSteps({
  current,
  failed,
  clock,
  now,
  progress,
}: {
  current: number;
  failed: boolean;
  clock: StepClock;
  now: number;
  progress?: StartupStepProgress;
}): StepListStep[] {
  return STEPS.map(({ id, label }, index) => {
    const state =
      index < current ? 'done' : index === current ? (failed ? 'failed' : 'current') : 'todo';
    const running = clock.current === index ? Math.max(0, now - clock.since) : 0;
    const spent = clock.spent[index];
    const elapsed = spent === undefined && running === 0 ? undefined : (spent ?? 0) + running;
    return {
      id,
      label,
      state,
      meta:
        state !== 'todo' && elapsed !== undefined ? formatDuration(elapsed, 'compact') : undefined,
      ...(state === 'current' && progress
        ? { log: progress.line, progress: progress.fraction }
        : {}),
    };
  });
}

/** What the current step is doing: one plain line under it, and a bar while downloading. */
export interface StartupStepProgress {
  line: string;
  /** 0 to 1. */
  fraction?: number;
}

/**
 * The local service's startup as a step list (connect-infrastructure, Local startup),
 * with each step's time in the step's meta column as conversation-states draws it.
 * Tool output (the boot log) stays out of the steps and shows only in Startup details;
 * the current step carries only a plain line on what it is doing (MB of a download).
 */
export function LocalStartupSteps({
  current,
  running,
  failed = false,
  log,
  detail,
  progress,
  className,
}: {
  /** The index of the current step: see `STARTUP_STEP_OF`. */
  current: number;
  /** What the current step is doing, under it. */
  progress?: StartupStepProgress;
  running: boolean;
  failed?: boolean;
  log: string;
  /** A sentence on what the current step is doing, shown in Startup details. */
  detail?: string;
  className?: string;
}) {
  const { clock, now } = useStepClock(current, running);
  const steps = startupSteps({ current, failed, clock, now, progress });
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <p role="status" className="sr-only">
        {STEPS[current]?.label}
      </p>
      <StepList label="Startup progress" steps={steps} />
      {detail || log ? (
        <TechnicalDetails
          title="Startup details"
          className="mt-1.5 min-w-0 text-menu"
          summaryClassName="min-h-[30px] gap-2.5 font-normal"
          contentClassName="pt-1.5"
        >
          {detail ? <p className="m-0 text-muted-foreground">{detail}</p> : null}
          {log ? (
            <pre className="clio-scrollbar mt-1.5 max-h-48 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-label whitespace-pre-wrap break-words text-muted-foreground">
              {log}
            </pre>
          ) : null}
        </TechnicalDetails>
      ) : null}
    </div>
  );
}
