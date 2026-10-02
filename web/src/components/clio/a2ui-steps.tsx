import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { TimerIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { SurfaceToolbar, type SurfaceCapabilities } from './surface-toolbar';

const stepSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    detail: z.string().optional(),
    durationSeconds: z.number().int().positive().optional(),
    quantity: z.number().min(0).optional(),
    quantityUnit: z.string().optional(),
    quantityUnitPlural: z.string().optional(),
    warning: z.string().optional(),
  })
  .strict();
// oxlint-disable-next-line react/only-export-components
export const stepsSchema = z
  .object({
    title: z.string().min(1),
    steps: z.array(stepSchema).min(1).max(100),
    scaleLabel: z.string().optional(),
    baseAmount: z.number().positive().optional(),
    progress: CommonSchemas.DynamicValue.optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

type GuideProps = z.infer<typeof stepsSchema>;
interface GuideProgress {
  completed: string[];
  deadlines: Record<string, number>;
  amount?: number;
}
const EMPTY_PROGRESS: GuideProgress = { completed: [], deadlines: {} };

function readProgress(value: unknown): GuideProgress {
  if (typeof value === 'string') {
    try {
      return readProgress(JSON.parse(value));
    } catch {
      return EMPTY_PROGRESS;
    }
  }
  if (!value || typeof value !== 'object') return EMPTY_PROGRESS;
  const raw = value as Record<string, unknown>;
  const completed = Array.isArray(raw.completed)
    ? raw.completed.filter((v): v is string => typeof v === 'string')
    : [];
  const deadlines: Record<string, number> = {};
  if (raw.deadlines && typeof raw.deadlines === 'object') {
    for (const [key, deadline] of Object.entries(raw.deadlines)) {
      if (typeof deadline === 'number' && Number.isFinite(deadline)) deadlines[key] = deadline;
    }
  }
  return { completed, deadlines, amount: typeof raw.amount === 'number' ? raw.amount : undefined };
}

function progressKey(storageId: string): string {
  return `clio:steps:${window.location.pathname}:${storageId}`;
}

function timerLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} sec timer`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes} min timer` : `${minutes} min ${remainder} sec timer`;
}

/** Procedure with progress persisted through its bound data model and session storage. */
export function ClioSteps({
  title,
  steps,
  scaleLabel = 'Amount',
  baseAmount = 1,
  progress,
  setProgress,
  storageId,
}: GuideProps & { storageId: string; setProgress?: (value: string) => void }) {
  const [local, setLocal] = useState<GuideProgress>(() => {
    if (progress) return readProgress(progress);
    try {
      return readProgress(JSON.parse(sessionStorage.getItem(progressKey(storageId)) ?? 'null'));
    } catch {
      return EMPTY_PROGRESS;
    }
  });
  const [now, setNow] = useState(() => Date.now());
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  useEffect(() => {
    // The producer's bound progress can arrive after the guide first mounts.
    // oxlint-disable-next-line react/set-state-in-effect
    if (progress) setLocal(readProgress(progress));
  }, [progress]);
  useEffect(() => {
    if (!Object.keys(local.deadlines).length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [local.deadlines]);
  const write = (next: GuideProgress) => {
    setLocal(next);
    try {
      sessionStorage.setItem(progressKey(storageId), JSON.stringify(next));
    } catch {
      /* data-model binding remains authoritative */
    }
    setProgress?.(JSON.stringify(next));
  };
  const amount = local.amount ?? baseAmount;
  const count = useMemo(
    () => steps.filter((step) => local.completed.includes(step.id)).length,
    [steps, local.completed],
  );
  const capabilities: SurfaceCapabilities = {
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
  };
  return (
    <SurfaceFullScreenHost
      fullscreen={fullscreen}
      headerExtra={<SurfaceToolbar capabilities={capabilities} floating={false} />}
      onOpenChange={setFullscreen}
      title={title}
    >
      <section
        aria-label={title}
        className={cn(
          'group relative space-y-4 rounded-xl border border-border/70 px-4 py-4',
          fullscreen && 'mx-auto w-full max-w-3xl border-0',
        )}
        data-slot="a2ui-steps"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className={cn('text-base font-semibold', fullscreen && 'sr-only')}>{title}</h3>
            <p className="text-xs text-muted-foreground">
              {count}/{steps.length} steps complete
            </p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            {steps.some((step) => step.quantity !== undefined) ? (
              <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                {scaleLabel}
                <Input
                  aria-label={scaleLabel}
                  className="h-8 w-20 shrink-0"
                  min="0.01"
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value) && value > 0) write({ ...local, amount: value });
                  }}
                  step="any"
                  type="number"
                  value={amount}
                />
              </label>
            ) : null}
            {!fullscreen ? <SurfaceToolbar capabilities={capabilities} floating={false} /> : null}
          </div>
        </div>
        <ol className="space-y-1">
          {steps.map((step, index) => {
            const checked = local.completed.includes(step.id);
            const deadline = local.deadlines[step.id];
            const remaining =
              deadline === undefined ? undefined : Math.max(0, Math.ceil((deadline - now) / 1000));
            return (
              <li
                className="rounded-lg border border-transparent px-2 py-3 hover:border-border/60 hover:bg-muted/30"
                key={step.id}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    aria-label={`Complete ${step.title}`}
                    checked={checked}
                    className="mt-1"
                    onCheckedChange={(value) =>
                      write({
                        ...local,
                        completed:
                          value === true
                            ? [...new Set([...local.completed, step.id])]
                            : local.completed.filter((id) => id !== step.id),
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {index + 1}.
                      </span>
                      <span
                        className={
                          checked
                            ? 'text-sm text-muted-foreground line-through'
                            : 'text-sm font-medium'
                        }
                      >
                        {step.title}
                      </span>
                      {step.quantity !== undefined ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
                            (step.quantity * amount) / baseAmount,
                          )}{' '}
                          {Math.abs((step.quantity * amount) / baseAmount) === 1
                            ? step.quantityUnit ?? ''
                            : step.quantityUnitPlural ?? step.quantityUnit ?? ''}
                        </span>
                      ) : null}
                    </div>
                    {step.detail ? (
                      <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
                    ) : null}
                    {step.warning ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        {step.warning}
                      </p>
                    ) : null}
                    {step.durationSeconds ? (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <TimerIcon aria-hidden="true" className="size-3.5" />
                        <span aria-live={remaining === 0 ? 'polite' : 'off'}>
                          {remaining === undefined
                            ? timerLabel(step.durationSeconds)
                            : remaining === 0
                              ? 'Timer finished'
                              : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} left`}
                        </span>
                        <Button
                          onClick={() => {
                            const started = Date.now();
                            setNow(started);
                            write({
                              ...local,
                              deadlines: {
                                ...local.deadlines,
                                [step.id]: started + step.durationSeconds! * 1000,
                              },
                            });
                          }}
                          size="xs"
                          type="button"
                          variant="secondary"
                        >
                          {remaining === undefined ? 'Start' : 'Restart'}
                        </Button>
                        {remaining !== undefined ? (
                          <Button
                            aria-label={`Clear timer for ${step.title}`}
                            onClick={() => {
                              const deadlines = { ...local.deadlines };
                              delete deadlines[step.id];
                              write({ ...local, deadlines });
                            }}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <RetryIcon aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </SurfaceFullScreenHost>
  );
}

// oxlint-disable-next-line react/only-export-components
export const ClioStepsCatalogComponent = createComponentImplementation(
  { name: 'clio.steps.v1', schema: stepsSchema },
  ({ props, context }) => (
    <ClioSteps
      {...props}
      storageId={`${context.componentModel.id}:${props.title}:${props.steps.map((step) => step.id).join(',')}`}
      setProgress={props.setProgress as ((value: string) => void) | undefined}
    />
  ),
);
