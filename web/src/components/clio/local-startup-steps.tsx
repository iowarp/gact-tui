import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StepList, type StepListStep } from './primitives/step-list';
import { TechnicalDetails } from './technical-details';

const STEPS = [
  { id: 'checking', label: 'Checking the local service' },
  { id: 'preparing', label: 'Preparing the runtime and packages' },
  { id: 'starting', label: 'Starting the local service' },
  { id: 'opening', label: 'Opening the workspace' },
] as const;

/** When each step was first seen current, and a clock that ticks while one runs. */
function useStepClock(current: number, running: boolean) {
  const [starts, setStarts] = useState<Record<number, number>>(() => ({ [current]: Date.now() }));
  const [now, setNow] = useState(() => Date.now());
  // A step's start is recorded in the render that first shows it current.
  if (starts[current] === undefined)
    setStarts((previous) => ({ ...previous, [current]: previous[current] ?? Date.now() }));
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return { starts, now };
}

function latestLine(log: string): string | undefined {
  return log
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('==='))
    .at(-1);
}

function startupSteps({
  current,
  failed,
  starts,
  now,
  line,
}: {
  current: number;
  failed: boolean;
  starts: Record<number, number>;
  now: number;
  line?: string;
}): StepListStep[] {
  return STEPS.map(({ id, label }, index) => {
    const state =
      index < current ? 'done' : index === current ? (failed ? 'failed' : 'current') : 'todo';
    const started = starts[index];
    const next = STEPS.findIndex((_, later) => later > index && starts[later] !== undefined);
    const ended = state === 'done' ? (next >= 0 ? starts[next] : undefined) : now;
    return {
      id,
      label,
      state,
      meta:
        state !== 'todo' && started !== undefined && ended !== undefined
          ? formatDuration(ended - started, 'compact')
          : undefined,
      log: index === current ? line : undefined,
    };
  });
}

/**
 * The local service's startup as a step list: each step's time, the latest
 * boot-log line under the current one, and the whole log in Startup details.
 */
export function LocalStartupSteps({
  current,
  running,
  failed = false,
  log,
  detail,
  className,
}: {
  /** The index of the current step: see `STARTUP_STEP_OF`. */
  current: number;
  running: boolean;
  failed?: boolean;
  log: string;
  /** A sentence on what the current step is doing, shown in Startup details. */
  detail?: string;
  className?: string;
}) {
  const { starts, now } = useStepClock(current, running);
  const steps = startupSteps({ current, failed, starts, now, line: latestLine(log) });
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <p role="status" className="sr-only">
        {STEPS[current]?.label}
      </p>
      <StepList label="Startup progress" steps={steps} />
      {detail || log ? (
        <TechnicalDetails
          title="Startup details"
          className="mt-3 ml-6 min-w-0 text-[12px]"
          summaryClassName="gap-1.5 font-normal"
          contentClassName="pt-1.5"
        >
          {detail ? <p className="m-0 text-muted-foreground">{detail}</p> : null}
          {log ? (
            <pre className="clio-scrollbar mt-1.5 max-h-48 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-words text-muted-foreground">
              {log}
            </pre>
          ) : null}
        </TechnicalDetails>
      ) : null}
    </div>
  );
}
