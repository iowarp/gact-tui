import { cn } from '@/lib/utils';
import { StepList, type StepListStep } from './primitives/step-list';
import { TechnicalDetails } from './technical-details';

const STEPS = [
  { id: 'checking', label: 'Checking the local service' },
  { id: 'preparing', label: 'Preparing the local runtime and packages' },
  { id: 'starting', label: 'Starting the local service' },
  { id: 'opening', label: 'Opening the workspace' },
] as const;

function startupSteps(current: number, failed: boolean): StepListStep[] {
  return STEPS.map(({ id, label }, index) => ({
    id,
    label,
    state: index < current ? 'done' : index === current ? (failed ? 'failed' : 'current') : 'todo',
  }));
}

/**
 * The local service's startup as a step list (connect-infrastructure, Local startup).
 * Tool output (the boot log) stays out of the steps and shows only in Startup details.
 */
export function LocalStartupSteps({
  current,
  failed = false,
  log,
  detail,
  className,
}: {
  /** The index of the current step: see `STARTUP_STEP_OF`. */
  current: number;
  failed?: boolean;
  log: string;
  /** A sentence on what the current step is doing, shown in Startup details. */
  detail?: string;
  className?: string;
}) {
  const steps = startupSteps(current, failed);
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <p role="status" className="sr-only">
        {STEPS[current]?.label}
      </p>
      <StepList label="Startup progress" steps={steps} />
      {detail || log ? (
        <TechnicalDetails
          title="Startup details"
          className="mt-1.5 min-w-0 text-[12.5px]"
          summaryClassName="min-h-[30px] gap-2.5 font-normal"
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
