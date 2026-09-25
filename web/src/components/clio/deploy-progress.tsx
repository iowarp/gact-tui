import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  MinusIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  formatElapsed,
  type DeployProgress,
  type DeployStage,
  type DeployStageState,
} from './deploy-progress-model';

const STATE_LABELS: Record<DeployStageState, string> = {
  pending: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Not needed',
};

/** Re-render once a second while something is running, for elapsed times. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  return now;
}

function StageIcon({ state }: { state: DeployStageState }) {
  if (state === 'running') return <Spinner aria-hidden="true" className="size-3" />;
  if (state === 'done') return <CheckIcon aria-hidden="true" className="size-3" />;
  if (state === 'failed') return <XIcon aria-hidden="true" className="size-3" />;
  if (state === 'cancelled') return <BanIcon aria-hidden="true" className="size-3" />;
  if (state === 'skipped') return <MinusIcon aria-hidden="true" className="size-3" />;
  return <CircleIcon aria-hidden="true" className="size-2" />;
}

function stageElapsed(stage: DeployStage, now: number): string | undefined {
  if (!stage.startedAt) return undefined;
  return formatElapsed((stage.endedAt ?? now) - stage.startedAt);
}

/** The live deployment stage list: each stage's state, substep, and elapsed time. */
export function DeployStageList({ progress }: { progress: DeployProgress }) {
  const stages = progress.stages.filter((stage) => !stage.hidden);
  const now = useNow(stages.some((stage) => stage.state === 'running'));
  const reached = stages.filter((stage) => stage.state !== 'pending').length;
  return (
    <Timeline aria-label="Deployment progress" className="px-1" role="list" value={reached}>
      {stages.map((stage, index) => {
        const elapsed = stageElapsed(stage, now);
        return (
          <TimelineItem
            aria-label={`${stage.label}: ${STATE_LABELS[stage.state]}`}
            className="group-data-[orientation=vertical]/timeline:not-last:pb-3"
            data-state={stage.state}
            key={stage.id}
            role="listitem"
            step={index + 1}
          >
            <TimelineIndicator
              className={cn(
                'grid size-5 place-items-center bg-background',
                stage.state === 'done' && 'border-primary text-primary',
                stage.state === 'running' && 'border-primary text-primary',
                stage.state === 'failed' && 'border-destructive text-destructive',
                (stage.state === 'pending' || stage.state === 'skipped') && 'text-muted-foreground',
              )}
            >
              <StageIcon state={stage.state} />
            </TimelineIndicator>
            <TimelineSeparator />
            <TimelineHeader className="flex items-baseline justify-between gap-3">
              <TimelineTitle
                className={cn(
                  stage.state === 'pending' || stage.state === 'skipped'
                    ? 'text-muted-foreground'
                    : undefined,
                  stage.state === 'failed' && 'text-destructive',
                )}
              >
                {stage.label}
                <span className="sr-only">: {STATE_LABELS[stage.state]}</span>
              </TimelineTitle>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {elapsed ?? (stage.state === 'skipped' ? STATE_LABELS.skipped : null)}
              </span>
            </TimelineHeader>
            {stage.detail && stage.state === 'running' ? (
              <TimelineContent className="truncate text-xs" title={stage.detail}>
                {stage.detail}
              </TimelineContent>
            ) : null}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}

/** One line saying what failed, with the cleaned log behind a Details disclosure. */
export function DeployFailure({
  details,
  reason,
  title,
}: {
  details?: string;
  reason: string;
  title: string;
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{reason}</p>
        {details ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                className="group h-auto w-fit px-0 text-muted-foreground hover:text-foreground"
                size="sm"
                type="button"
                variant="link"
              >
                Details
                <ChevronDownIcon
                  aria-hidden="true"
                  className="transition-transform group-data-[state=open]:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="clio-scrollbar max-h-64 overflow-auto whitespace-pre-wrap border-y bg-background/60 p-3 font-mono text-xs text-foreground">
                {details}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
