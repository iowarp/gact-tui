import type { FlowRun, SubagentRun } from '@clio/core/v3';
import { Maximize2Icon, Minimize2Icon, WorkflowIcon } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useFlowQuestions, useFlowRun, useOpenTaskHandle } from '@/hooks/use-flow-run';
import {
  rowDuration,
  useFlowPresentation,
  useFlowToolArgs,
  useSessionAgentRef,
  type FlowPresentation,
} from '@/hooks/use-flow-presentation';
import { cn } from '@/lib/utils';
import { ContentMarkdown } from './content-markdown';
import type { FlowQuestion } from './flow-run-edits';
import { FlowEdits } from './flow-run-edit-list';
import {
  FlowApprovals,
  FlowScript,
  FlowStall,
  FlowVerdictView,
  WorkflowBounds,
} from './flow-run-parts';
import { flowRunStatus, flowTaskHistoryUnavailable, stepTally } from './flow-run-presentation';
import { flowLabel } from './flow-tool-presentation';
import { FlowTrack } from './flow-track';
import { FlowUsageSummary } from './flow-run-usage';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';

/**
 * A flow run drawn from the task layer: the live workflow, council or arena as a
 * Pele railroad coloured by state, whose nodes open their instructions or
 * answers, and any typed stall. Each task handle opens its conversation; Full
 * screen shows the same run large, for following (or recording) it as it
 * changes.
 */
export function FlowRunView({
  sessionId,
  handle,
  label,
  onOpenSubagent,
}: {
  sessionId: string;
  handle: string;
  label?: string;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}) {
  const run = useFlowRun(sessionId, handle);
  const open = useOpenTaskHandle(onOpenSubagent);
  const openHandle = useCallback(
    (target: string, how: SubagentOpenTarget = 'canvas') =>
      open.mutate({ handle: target, target: how }),
    [open],
  );
  const args = useFlowToolArgs(handle);
  const agentRef = useSessionAgentRef(sessionId);
  const presentation = useFlowPresentation(run.data, agentRef, args, sessionId);
  const [fullScreen, setFullScreen] = useState(false);
  const questions = useFlowQuestions(sessionId, run.data);
  if (run.isPending) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Loading the flow run…
      </p>
    );
  }
  if (run.error) {
    return (
      <Alert className="m-4 w-auto" variant="destructive">
        <AlertTitle>Flow run unavailable</AlertTitle>
        <AlertDescription>{run.error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!run.data) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No flow run is recorded for this task yet. It appears once the flow starts.
      </p>
    );
  }
  const data = run.data;
  const details = (layout: 'panel' | 'wide') => (
    <FlowRunDetails
      args={args}
      handle={handle}
      label={label}
      layout={layout}
      onFullScreen={layout === 'panel' ? () => setFullScreen(true) : undefined}
      onOpenHandle={(target, how) => {
        if (layout === 'wide') setFullScreen(false);
        openHandle(target, how);
      }}
      openError={open.error?.message}
      presentation={presentation}
      questions={questions}
      run={data}
    />
  );
  return (
    <>
      <div className="h-full min-h-0 overflow-y-auto p-3 sm:p-4">{details('panel')}</div>
      <FlowRunFullScreen
        onOpenChange={setFullScreen}
        open={fullScreen}
        run={data}
        title={label || `${flowLabel(data.flow)} run`}
      >
        {details('wide')}
      </FlowRunFullScreen>
    </>
  );
}

/** The whole viewport for one run, closed with Exit full screen or Escape. */
export function FlowRunFullScreen({
  open,
  onOpenChange,
  title,
  run,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  run: FlowRun;
  children: ReactNode;
}) {
  const status = flowRunStatus(run);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="grid h-dvh w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 sm:max-w-none"
        showCloseButton={false}
      >
        <div className="flex min-w-0 items-center gap-3 border-b px-4 py-2">
          <WorkflowIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <DialogTitle className="min-w-0 truncate text-sm font-medium">{title}</DialogTitle>
          <ClioStatus label={status.label} value={status.value} />
          <Button className="ml-auto" onClick={() => onOpenChange(false)} size="sm" variant="ghost">
            <Minimize2Icon aria-hidden="true" /> Exit full screen
          </Button>
        </div>
        <div className="min-h-0 overflow-auto p-3 sm:p-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** The run's header, outcome, track, script and result, shared by the panel and full screen. */
export function FlowRunDetails({
  run,
  handle,
  label,
  args,
  presentation,
  layout,
  onOpenHandle,
  onFullScreen,
  openError,
  questions = [],
}: {
  run: FlowRun;
  /** The approval questions the run asked, with the answers. */
  questions?: readonly FlowQuestion[];
  handle: string;
  label?: string;
  args?: Record<string, unknown>;
  presentation: FlowPresentation;
  layout: 'panel' | 'wide';
  onOpenHandle: (handle: string, how?: SubagentOpenTarget) => void;
  onFullScreen?: () => void;
  openError?: string;
}) {
  const status = flowRunStatus(run);
  const { steps, members, verdict, closing, runElapsed } = presentation;
  const workflow = run.view;
  const taskCount = workflow || run.execution?.length ? steps.length : members.length;
  const historyUnavailable = flowTaskHistoryUnavailable(run, taskCount);
  const tally = historyUnavailable
    ? ''
    : stepTally((workflow || run.execution?.length ? steps : members).map((row) => row.status));
  const count = historyUnavailable
    ? 'Task history not recorded'
    : workflow || run.execution?.length
      ? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`
      : `${members.length} ${run.flow === 'arena' ? (members.length === 1 ? 'entry' : 'entries') : run.flow === 'council' ? (members.length === 1 ? 'member' : 'members') : members.length === 1 ? 'task' : 'tasks'}`;
  const wide = layout === 'wide';
  const header = (
    <header className="grid min-w-0 gap-1">
      {/* Full screen names the run and its state in its own title bar. */}
      {wide ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight">
            <WorkflowIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="truncate">{label || `${flowLabel(run.flow)} run`}</span>
          </h2>
          <ClioStatus label={status.label} value={status.value} />
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 text-xs text-muted-foreground">
          {[
            flowLabel(run.flow),
            count,
            tally,
            rowDuration(runElapsed),
            run.depth > 1 ? `nested ${run.depth} flows deep` : '',
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
        <div className="ml-auto flex items-center gap-1">
          {onFullScreen ? (
            <Button onClick={onFullScreen} size="xs" variant="ghost">
              <Maximize2Icon aria-hidden="true" /> Full screen
            </Button>
          ) : null}
          <Button onClick={() => onOpenHandle(handle)} size="xs" variant="ghost">
            Open its conversation
          </Button>
        </div>
      </div>
      <FlowUsageSummary usage={run.usage} />
      {workflow ? <WorkflowBounds view={workflow} /> : null}
      {openError ? (
        <p className="text-sm text-destructive" role="alert">
          {openError}
        </p>
      ) : null}
    </header>
  );
  const track = (
    <FlowTrack
      className={cn('rounded-md border bg-background/60 p-2', wide && 'p-4 sm:p-6 [&_svg]:mx-auto')}
      flow={run.flow}
      fontSize={wide ? 14 : 12}
      onOpenHandle={onOpenHandle}
      presentation={presentation}
      questions={questions}
      scale={wide ? 1.5 : 1}
      usage={run.usage}
      historyUnavailable={historyUnavailable}
    />
  );
  const after = (
    <>
      {!workflow && closing && run.status === 'completed' ? (
        <FlowVerdictView flow={run.flow} verdict={verdict} />
      ) : null}
      {!workflow && !closing && run.status === 'completed' && run.result !== undefined ? (
        <FlowResult result={run.result} />
      ) : null}
      {workflow && run.status === 'completed' && run.result !== undefined && run.result !== null ? (
        <FlowResult result={run.result} />
      ) : null}
      <FlowScript args={args} run={run} steps={steps} />
      {run.events.length ? (
        <details className="rounded-md border px-2 py-1.5 text-xs">
          <summary className="cursor-pointer font-medium">
            What happened, in order ({run.events.length})
          </summary>
          <ol className="mt-2 grid gap-1">
            {run.events.map((event, index) => (
              <li
                className="flex flex-wrap gap-x-2"
                key={`${event.event}:${event.step ?? ''}:${index}`}
              >
                <span className="font-medium">{event.event.replaceAll('_', ' ')}</span>
                {event.step ? <span className="text-muted-foreground">{event.step}</span> : null}
                {typeof event.by === 'string' && event.by ? (
                  <span className="text-muted-foreground">by {event.by}</span>
                ) : null}
                {typeof event.message === 'string' ? (
                  <span className="text-muted-foreground">{event.message}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </>
  );
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {header}
      {run.outcome ? (
        <FlowStall
          cancelled={run.status === 'cancelled'}
          details
          onOpenHandle={onOpenHandle}
          outcome={run.outcome}
        />
      ) : null}
      {workflow ? (
        <FlowApprovals
          onOpenQuestions={() => onOpenHandle(handle, 'conversation')}
          questions={run.questions.length}
          view={workflow}
        />
      ) : null}
      <FlowEdits
        onOpenHandle={onOpenHandle}
        questions={questions}
        run={run}
        showAwaiting={false}
        steps={steps}
      />
      {/* Full screen gives the diagram the whole width, to follow (or record) the run. */}
      {track}
      {after}
    </div>
  );
}

function FlowResult({ result }: { result: unknown }) {
  const finals = workflowFinalAnswers(result);
  const answer =
    result && typeof result === 'object' && 'answer' in result
      ? (result as { answer: unknown }).answer
      : result;
  return (
    <section aria-label="Flow result" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">Result</h3>
      {finals ? (
        // A workflow's result is its final steps' answers; each earlier step's answer is
        // on that step in the diagram, not repeated here.
        finals.map(([step, text]) => (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" key={step}>
            {finals.length > 1 ? <p className="text-xs font-medium">{step}</p> : null}
            <ContentMarkdown className="text-sm leading-6">{text}</ContentMarkdown>
          </div>
        ))
      ) : typeof answer === 'string' ? (
        // The answer is the model's Markdown, rendered as the conversation renders it.
        <ContentMarkdown className="text-sm leading-6">{answer}</ContentMarkdown>
      ) : (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 font-mono text-xs">
          {JSON.stringify(answer, null, 2)}
        </pre>
      )}
    </section>
  );
}

/** A completed workflow's final steps (none waits on them) with their answers, in order. */
function workflowFinalAnswers(result: unknown): Array<[string, string]> | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const { results, workflow } = result as {
    results?: Record<string, unknown>;
    workflow?: { steps?: Array<{ id?: unknown; after?: unknown }> };
  };
  const steps = workflow?.steps;
  if (!results || typeof results !== 'object' || !Array.isArray(steps)) return undefined;
  const waitedOn = new Set(
    steps.flatMap((step) => (Array.isArray(step.after) ? step.after.map(String) : [])),
  );
  const finals = steps
    .map((step) => String(step.id ?? ''))
    .filter((id) => id && !waitedOn.has(id) && typeof results[id] === 'string')
    .map((id): [string, string] => [id, String(results[id])]);
  return finals.length ? finals : undefined;
}
