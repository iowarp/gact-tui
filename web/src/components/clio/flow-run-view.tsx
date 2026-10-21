import type { FlowCall, FlowOutcome, PlanView, SubagentRun } from '@clio/core/v3';
import { WorkflowIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFlowRun, useOpenTaskHandle } from '@/hooks/use-flow-run';
import { ContentMarkdown } from './content-markdown';
import { FlowPlanGraph } from './flow-plan-graph';
import { flowCallStatus, flowRunStatus, planNodeStatus } from './flow-run-presentation';
import { flowLabel } from './flow-tool-presentation';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';

/**
 * A flow run drawn from the task layer: the live plan (nodes, dependencies,
 * proposals awaiting approval), the calls of other flows, and any typed stall
 * with its reason and step. Each task handle opens its conversation.
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
  const status = flowRunStatus(data);
  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto p-3 sm:p-4">
      <header className="rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
          <WorkflowIcon aria-hidden="true" className="size-4" /> Flow run
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{label || flowLabel(data.flow)}</h2>
          <ClioStatus label={status.label} value={status.value} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{data.flow}</Badge>
          {data.view ? <PlanBounds view={data.view} /> : null}
          {data.depth > 1 ? <span>Nested {data.depth} flows deep</span> : null}
          <Button onClick={() => openHandle(handle)} size="xs" variant="ghost">
            Open its conversation
          </Button>
        </div>
        {open.error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {open.error.message}
          </p>
        ) : null}
      </header>
      {data.outcome ? (
        <FlowStall
          cancelled={data.status === 'cancelled'}
          onOpenHandle={openHandle}
          outcome={data.outcome}
        />
      ) : null}
      {data.view ? (
        <PlanSection
          onOpenHandle={openHandle}
          onOpenQuestions={() => openHandle(handle, 'conversation')}
          questions={data.questions.length}
          view={data.view}
        />
      ) : (
        <CallList calls={data.calls} onOpenHandle={openHandle} />
      )}
      {data.status === 'completed' && data.result !== undefined ? (
        <FlowResult result={data.result} />
      ) : null}
      {data.events.length ? (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Run events ({data.events.length})
          </summary>
          <ol className="mt-2 grid gap-1.5">
            {data.events.map((event, index) => (
              <li
                className="flex flex-wrap gap-x-2"
                key={`${event.event}:${event.node ?? ''}:${index}`}
              >
                <span className="font-medium">{event.event.replaceAll('_', ' ')}</span>
                {event.node ? <span className="text-muted-foreground">{event.node}</span> : null}
                {typeof event.message === 'string' ? (
                  <span className="text-muted-foreground">· {event.message}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function PlanBounds({ view }: { view: PlanView }) {
  return (
    <>
      <span>
        {view.nodes.length} {view.nodes.length === 1 ? 'node' : 'nodes'}
      </span>
      <span>
        {view.added} added{view.max_added != null ? ` of ${view.max_added}` : ''}
      </span>
      <span>
        {view.rounds} editing {view.rounds === 1 ? 'round' : 'rounds'}
        {view.max_rounds != null ? ` of ${view.max_rounds}` : ''}
      </span>
      {view.editors.length ? <span>Editors: {view.editors.join(', ')}</span> : null}
      {view.approve_edits ? <span>Additions need your approval</span> : null}
    </>
  );
}

function FlowStall({
  cancelled,
  outcome,
  onOpenHandle,
}: {
  cancelled: boolean;
  outcome: FlowOutcome;
  onOpenHandle: (handle: string) => void;
}) {
  // A cancelled run ended because someone asked it to: no fault to repair.
  const title = cancelled
    ? 'The flow was cancelled'
    : outcome.reason === 'flow_stall'
      ? 'The flow stalled'
      : 'The flow stopped';
  return (
    <Alert variant={cancelled ? 'default' : 'destructive'}>
      <AlertTitle>
        {title}
        {outcome.step ? ` at ${outcome.step}` : ''}
      </AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{outcome.message || 'No message was recorded.'}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt>Reason</dt>
          <dd className="font-mono">{outcome.reason}</dd>
          {outcome.stall ? (
            <>
              <dt>Stall</dt>
              <dd className="font-mono">{outcome.stall}</dd>
            </>
          ) : null}
          {outcome.step ? (
            <>
              <dt>Step</dt>
              <dd className="font-mono">{outcome.step}</dd>
            </>
          ) : null}
          {outcome.predicate ? (
            <>
              <dt>Waiting for</dt>
              <dd className="font-mono">{outcome.predicate}</dd>
            </>
          ) : null}
        </dl>
        {outcome.handle ? (
          <Button
            className="w-fit"
            onClick={() => onOpenHandle(outcome.handle!)}
            size="xs"
            variant="outline"
          >
            {cancelled ? 'Open the cancelled step' : 'Open the stalled step'}
          </Button>
        ) : null}
        {outcome.observed !== undefined ? (
          <details className="text-xs">
            <summary className="cursor-pointer">What the flow observed</summary>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono">
              {JSON.stringify(outcome.observed, null, 2)}
            </pre>
          </details>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function PlanSection({
  view,
  questions,
  onOpenHandle,
  onOpenQuestions,
}: {
  view: PlanView;
  questions: number;
  onOpenHandle: (handle: string) => void;
  onOpenQuestions: () => void;
}) {
  return (
    <section aria-label="Plan" className="grid gap-3">
      {view.awaiting_approval.length ? (
        <Alert>
          <AlertTitle>
            {view.awaiting_approval.length === 1
              ? 'A proposed node is waiting for your approval'
              : `${view.awaiting_approval.length} proposed nodes are waiting for your approval`}
          </AlertTitle>
          <AlertDescription className="grid gap-2">
            <ul className="grid gap-1.5">
              {view.awaiting_approval.map((proposal) => (
                <li key={proposal.id}>
                  <span className="font-medium">{proposal.id}</span> runs {proposal.target}
                  {proposal.after.length ? ` after ${proposal.after.join(', ')}` : ''}
                  {proposal.by ? `, proposed by ${proposal.by}` : ''}
                  {proposal.reason ? `: ${proposal.reason}` : ''}
                </li>
              ))}
            </ul>
            {questions ? (
              <Button className="w-fit" onClick={onOpenQuestions} size="sm">
                Answer the approval question
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <FlowPlanGraph onOpenHandle={onOpenHandle} view={view} />
      <ol aria-label="Plan nodes" className="grid gap-1.5">
        {view.nodes.map((node) => {
          const status = planNodeStatus(node);
          return (
            <li
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm"
              key={node.id}
            >
              <span className="font-medium">{node.id}</span>
              <ClioStatus label={status.label} value={status.value} />
              <span className="min-w-0 truncate text-muted-foreground">{node.target}</span>
              <span className="text-xs text-muted-foreground">
                {node.after.length ? `after ${node.after.join(', ')}` : 'starts first'}
              </span>
              {node.handle ? (
                <Button
                  className="ml-auto"
                  onClick={() => onOpenHandle(node.handle!)}
                  size="xs"
                  variant="ghost"
                >
                  Open
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CallList({
  calls,
  onOpenHandle,
}: {
  calls: readonly FlowCall[];
  onOpenHandle: (handle: string) => void;
}) {
  if (!calls.length) {
    return <p className="text-sm text-muted-foreground">The flow has not started any task yet.</p>;
  }
  return (
    <section aria-label="Flow calls" className="grid gap-2">
      <h3 className="text-sm font-semibold">Tasks started by the flow</h3>
      <ol className="grid gap-1.5">
        {calls.map((call, index) => (
          <li
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm"
            key={call.invocation}
          >
            <span className="font-medium">
              {call.kind === 'ask' ? 'Question' : `Call ${index + 1}`}
            </span>
            <span className="text-muted-foreground">{call.target}</span>
            <ClioStatus
              label={flowCallStatus(call.status).label}
              value={flowCallStatus(call.status).value}
            />
            {call.handle ? (
              <Button
                className="ml-auto"
                onClick={() => onOpenHandle(call.handle)}
                size="xs"
                variant="ghost"
              >
                Open
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function FlowResult({ result }: { result: unknown }) {
  const answer =
    result && typeof result === 'object' && 'answer' in result
      ? (result as { answer: unknown }).answer
      : result;
  return (
    <section aria-label="Flow result" className="grid gap-2">
      <h3 className="text-sm font-semibold">Result</h3>
      {typeof answer === 'string' ? (
        // The answer is the model's Markdown, rendered as the conversation renders it.
        <ContentMarkdown className="rounded-lg border bg-card p-3 text-sm leading-6">
          {answer}
        </ContentMarkdown>
      ) : (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-card p-3 font-mono text-xs">
          {JSON.stringify(answer, null, 2)}
        </pre>
      )}
    </section>
  );
}
