import type { InfrastructureOperation, OperationStep, OperationStepState } from '@clio/core/v3';
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  HistoryIcon,
  MinusIcon,
  XIcon,
} from 'lucide-react';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useOperationStream } from '@/hooks/use-operation-stream';
import { cn } from '@/lib/utils';
import { formatElapsed } from './deploy-progress-model';
import { useNow } from './deploy-progress';
import { OperationLogTerminal } from './operation-log-terminal';
import {
  operationElapsedSeconds,
  reuseNote,
  stepCounter,
  stepFraction,
} from './operation-progress-model';

const STEP_STATE_LABELS: Record<OperationStepState, string> = {
  pending: 'Waiting',
  running: 'Running',
  succeeded: 'Done',
  reused: 'Reused',
  skipped: 'Not needed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const OPERATION_STATE_LABELS: Record<InfrastructureOperation['state'], string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function StepIcon({ state }: { state: OperationStepState }) {
  if (state === 'running') return <Spinner aria-hidden="true" className="size-3" />;
  if (state === 'succeeded') return <CheckIcon aria-hidden="true" className="size-3" />;
  if (state === 'reused') return <HistoryIcon aria-hidden="true" className="size-3" />;
  if (state === 'failed') return <XIcon aria-hidden="true" className="size-3" />;
  if (state === 'cancelled') return <BanIcon aria-hidden="true" className="size-3" />;
  if (state === 'skipped') return <MinusIcon aria-hidden="true" className="size-3" />;
  return <CircleIcon aria-hidden="true" className="size-2" />;
}

/** A bar only as precise as the service measured: a fraction, or an honest "working". */
function StepBar({ step, label }: { step: OperationStep; label: string }) {
  const fraction = stepFraction(step);
  if (fraction !== undefined) {
    return (
      <Progress
        aria-label={`${label} progress`}
        aria-valuetext={`${Math.round(fraction * 100)}%`}
        className="mt-1"
        data-determinate="true"
        value={fraction * 100}
      />
    );
  }
  return (
    <div
      aria-label={`${label} progress`}
      aria-valuetext="In progress, amount unknown"
      className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
      data-determinate="false"
      role="progressbar"
    >
      <div className="absolute inset-0 rounded-full bg-primary/40 motion-safe:animate-pulse" />
    </div>
  );
}

function stepElapsed(step: OperationStep, now: number): string | undefined {
  if (step.state === 'running' && step.started_at) {
    const started = Date.parse(step.started_at);
    if (Number.isFinite(started)) return formatElapsed(now - started);
  }
  return typeof step.elapsed_seconds === 'number'
    ? formatElapsed(step.elapsed_seconds * 1000)
    : undefined;
}

/**
 * Live progress of one long infrastructure operation: its ordered steps and
 * their states, a bar per running step (determinate only where measured),
 * elapsed time, what was reused instead of redone, and an expandable live log
 * fed by the operation's event stream (resumed with Last-Event-ID).
 */
export function OperationProgress({
  operationId,
  initial,
  title,
  fallbackProgress,
  onCancel,
  onReinstallFromScratch,
}: {
  operationId: string;
  /** The record already held (from the action or the inventory), shown until the stream answers. */
  initial?: InfrastructureOperation;
  title: string;
  /** The polled one-line progress, shown until (or unless) the live stream answers. */
  fallbackProgress?: string;
  onCancel?: () => void;
  /** Offered once the operation ended, for a fresh install that reuses nothing. */
  onReinstallFromScratch?: () => void;
}) {
  const stream = useOperationStream(operationId, initial);
  const operation = stream.operation ?? initial;
  const state = operation?.state ?? 'running';
  const progressText = operation?.progress || fallbackProgress;
  const running = state === 'queued' || state === 'running';
  const now = useNow(running);
  const steps = operation?.steps ?? [];
  const reused = operation?.reused ?? [];
  const elapsed = operation ? operationElapsedSeconds(operation, now, running) : undefined;
  const currentStep = steps.find((step) => step.state === 'running');
  return (
    <section
      aria-label={title}
      className="space-y-3 rounded-lg border p-3"
      data-slot="operation-progress"
      data-state={state}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p aria-live="polite" className="min-w-0 text-sm" role="status">
            <span className="font-medium">{OPERATION_STATE_LABELS[state]}</span>
            {progressText ? (
              <>
                <span aria-hidden="true" className="text-muted-foreground">
                  {' · '}
                </span>
                <span className="text-muted-foreground">{progressText}</span>
              </>
            ) : null}
          </p>
          {operation?.from_scratch ? (
            <Badge size="sm" variant="outline">
              From scratch
            </Badge>
          ) : null}
        </div>
        {elapsed !== undefined ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            Elapsed {formatElapsed(elapsed * 1000)}
          </span>
        ) : null}
      </header>
      {steps.length ? (
        <ol aria-label="Steps" className="space-y-2">
          {steps.map((step, index) => {
            const counter = stepCounter(step.progress);
            const time = stepElapsed(step, now);
            return (
              <li
                aria-label={`${step.label}: ${STEP_STATE_LABELS[step.state]}`}
                className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-2"
                data-state={step.state}
                key={`${step.id}:${index}`}
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-5 place-items-center rounded-full border bg-background',
                    (step.state === 'running' || step.state === 'succeeded') &&
                      'border-primary text-primary',
                    step.state === 'reused' && 'border-primary/60 text-primary',
                    step.state === 'failed' && 'border-destructive text-destructive',
                    (step.state === 'pending' || step.state === 'skipped') &&
                      'text-muted-foreground',
                  )}
                >
                  <StepIcon state={step.state} />
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm',
                      (step.state === 'pending' || step.state === 'skipped') &&
                        'text-muted-foreground',
                      step.state === 'failed' && 'text-destructive',
                    )}
                  >
                    {step.label}
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      · {STEP_STATE_LABELS[step.state]}
                    </span>
                  </p>
                  {step.message || counter ? (
                    <p className="truncate text-xs text-muted-foreground" title={step.message}>
                      {[counter, step.message].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {step.state === 'running' && running ? (
                    <StepBar label={step.label} step={step} />
                  ) : null}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{time}</span>
              </li>
            );
          })}
        </ol>
      ) : running && !currentStep ? (
        <div
          aria-label={`${title}: in progress`}
          aria-valuetext="In progress, amount unknown"
          className="relative h-1 w-full overflow-hidden rounded-full bg-muted"
          data-determinate="false"
          role="progressbar"
        >
          <div className="absolute inset-0 rounded-full bg-primary/40 motion-safe:animate-pulse" />
        </div>
      ) : null}
      {reused.length ? (
        <ul aria-label="Reused instead of redone" className="space-y-1">
          {reused.map((row) => (
            <li
              className="border-l-2 border-primary/50 pl-2 text-xs text-muted-foreground"
              data-slot="reuse-note"
              key={`${row.thing}:${row.identity}`}
            >
              {reuseNote(row)}
            </li>
          ))}
        </ul>
      ) : null}
      {state === 'failed' && operation?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {operation.error}
        </p>
      ) : null}
      {(running && onCancel) || (!running && onReinstallFromScratch) ? (
        <div className="flex flex-wrap gap-2">
          {running && onCancel ? (
            <Button onClick={onCancel} size="sm" type="button" variant="ghost">
              Cancel operation
            </Button>
          ) : null}
          {!running && onReinstallFromScratch ? (
            <Button onClick={onReinstallFromScratch} size="sm" type="button" variant="outline">
              Reinstall from scratch
            </Button>
          ) : null}
        </div>
      ) : null}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            className="group h-auto w-fit px-0 text-muted-foreground hover:text-foreground"
            size="sm"
            type="button"
            variant="link"
          >
            Live log
            {stream.lines.length ? ` (${stream.lines.length} lines)` : ''}
            <ChevronDownIcon
              aria-hidden="true"
              className="transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <OperationLogTerminal gap={stream.gap} label={`${title} log`} lines={stream.lines} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
