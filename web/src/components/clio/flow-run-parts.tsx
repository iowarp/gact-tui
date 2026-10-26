import type { FlowOutcome, FlowRun, FlowRunUsage, WorkflowView } from '@clio/core/v3';
import { ChevronRightIcon, CopyIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFlowTaskAnswer } from '@/hooks/use-flow-run';
import { rowDuration, type FlowInfo } from '@/hooks/use-flow-presentation';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { ContentMarkdown } from './content-markdown';
import {
  approvalDecisions,
  flowScriptJson,
  inputText,
  type FlowMember,
  type FlowState,
  type FlowStep,
  type FlowTone,
  type FlowVerdict,
} from './flow-run-presentation';
import { callModel } from '@/lib/flow-run-usage';
import { FlowName } from './flow-name';
import type { FlowPick } from './flow-railroad';
import { ClioStatus } from './status';

/** Each state's word in the legend, in the order the legend lists them. */
const TONE_WORDS: readonly (readonly [FlowTone, string])[] = [
  ['running', 'running'],
  ['done', 'ran'],
  ['failed', 'stopped or rejected'],
  ['waiting', 'waiting'],
  ['proposed', 'awaiting approval'],
  ['cancelled', 'did not run or cancelled'],
  ['unknown', 'not reported'],
];

/** The swatch of a state, drawn as index.css draws a node in that state (same tokens). */
const TONE_SWATCH: Record<FlowTone, string> = {
  running: 'border-dashed border-status-running-foreground bg-status-running',
  done: 'border-status-supported-foreground bg-status-supported',
  failed: 'border-destructive bg-destructive/10',
  waiting: 'border-dashed border-muted-foreground',
  proposed: 'border-dashed border-warning bg-warning/10',
  cancelled: 'border-dotted border-muted-foreground bg-muted',
  unknown: 'border-muted-foreground',
};

/**
 * What the colours of the diagram mean, for the states it shows, and how to
 * see a step. The diagram's labels are names only.
 */
export function FlowLegend({ tones, hint }: { tones: readonly FlowTone[]; hint?: string }) {
  const shown = TONE_WORDS.filter(([tone]) => tones.includes(tone));
  if (!shown.length && !hint) return null;
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {shown.map(([tone, word]) => (
        <span className="inline-flex items-center gap-1" key={tone}>
          <span
            aria-hidden="true"
            className={cn('inline-block h-2.5 w-4 rounded-full border-[1.5px]', TONE_SWATCH[tone])}
          />
          {word}
        </span>
      ))}
      {hint ? <span className="ml-auto">{hint}</span> : null}
    </p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="min-w-0 [overflow-wrap:anywhere]">
      <span className="text-muted-foreground">{label}: </span>
      {children}
    </p>
  );
}

function Instructions({ input, title = 'Instructions' }: { input: unknown; title?: string }) {
  const text = inputText(input);
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-muted-foreground">{title}</p>
      {text ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-sans text-xs leading-5 text-foreground">
          {text}
        </pre>
      ) : (
        <p>None written; the step receives the workflow&apos;s task and the answers it waits on.</p>
      )}
    </div>
  );
}

/**
 * The node the person selected in the diagram: its state, who runs it, how
 * long it took, Open, and what it holds: a step's instructions, an entry's
 * or member's answer, or the judge's choice or the synthesis.
 */
export function FlowPickDetails({
  pick,
  elapsed,
  flows,
  usage,
  onOpenHandle,
  onClose,
}: {
  pick: FlowPick;
  elapsed: ReadonlyMap<string, number>;
  /** The run's usage, for the model each call's child runs on. */
  usage?: FlowRunUsage;
  /** What each flow the agent can run is, so a flow's name opens it. */
  flows?: ReadonlyMap<string, FlowInfo>;
  onOpenHandle: (handle: string) => void;
  onClose: () => void;
}) {
  if (pick.kind === 'closing') {
    return (
      <PickFrame name={pick.label} onClose={onClose} status={pick.state}>
        {pick.state.tone === 'done' ? (
          <FlowVerdictView flow={pick.flow} verdict={pick.verdict} />
        ) : (
          <p>
            {pick.state.tone === 'cancelled'
              ? 'It did not run.'
              : `It runs once every ${pick.flow === 'arena' ? 'entry' : 'member'} has answered.`}
          </p>
        )}
      </PickFrame>
    );
  }
  if (pick.kind === 'member') {
    return (
      <MemberDetails
        elapsed={elapsed.get(pick.member.key)}
        flows={flows}
        member={pick.member}
        model={callModel(usage, pick.member.handle)}
        onClose={onClose}
        onOpenHandle={onOpenHandle}
      />
    );
  }
  const step = pick.step;
  return (
    <PickFrame
      badge={
        step.kind === 'flow'
          ? 'Flow'
          : step.kind === 'editor'
            ? 'Editor'
            : step.addedBy
              ? step.kind === 'proposal'
                ? 'Proposed'
                : 'Added'
              : undefined
      }
      handle={step.handle}
      name={step.label ?? step.id}
      onClose={onClose}
      onOpenHandle={onOpenHandle}
      status={step.status}
      time={rowDuration(elapsed.get(step.id))}
    >
      {step.targetLabel ? (
        <Fact label="Runs">
          {step.kind === 'flow' ? (
            <FlowName info={flows?.get(step.target)} name={step.targetLabel} />
          ) : (
            step.targetLabel
          )}
        </Fact>
      ) : null}
      {!step.label ? (
        <Fact label="Waits on">
          {step.after.length
            ? step.after.map((id) => (id.startsWith('run:') ? id.slice(4) : id)).join(', ')
            : 'nothing; starts first'}
        </Fact>
      ) : null}
      {callModel(usage, step.handle) ? (
        <Fact label="Model">{callModel(usage, step.handle)}</Fact>
      ) : null}
      {step.attempts > 1 ? <Fact label="Attempts">{step.attempts}</Fact> : null}
      {step.addedBy ? (
        <Fact label={step.kind === 'proposal' ? 'Proposed by' : 'Added by'}>
          {step.addedBy}
          {step.note ? `: ${step.note}` : ''}
        </Fact>
      ) : step.note ? (
        <Fact label="Description">{step.note}</Fact>
      ) : null}
      {step.kind !== 'action' && (!step.label || step.input !== undefined) ? (
        <Instructions input={step.input} />
      ) : null}
      {step.handle ? <TaskAnswer handle={step.handle} status={step.status} /> : null}
    </PickFrame>
  );
}

function PickFrame({
  name,
  status,
  badge,
  handle,
  time,
  onOpenHandle,
  onClose,
  children,
}: {
  name: string;
  status: FlowState;
  badge?: string;
  handle?: string;
  time?: string;
  onOpenHandle?: (handle: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={`${name}: ${status.label}`}
      className="grid min-w-0 gap-2 rounded-md border bg-card/60 px-3 py-2 text-xs leading-5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <ClioStatus
          className="shrink-0 px-1.5 py-0 text-[11px]"
          label={status.label}
          value={status.value}
        />
        <span className="min-w-0 truncate font-medium">{name}</span>
        {badge ? (
          <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="outline">
            {badge}
          </Badge>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {time ? <span className="text-xs tabular-nums text-muted-foreground">{time}</span> : null}
          {handle && onOpenHandle ? (
            <Button
              aria-label={`Open ${name}`}
              className="h-6 px-2 text-xs"
              onClick={() => onOpenHandle(handle)}
              size="xs"
              variant="ghost"
            >
              Open
            </Button>
          ) : null}
          <Button
            aria-label={`Close ${name}`}
            className="size-6"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <CloseIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </span>
      </div>
      {children}
    </section>
  );
}

function MemberDetails({
  member,
  elapsed,
  flows,
  model,
  onOpenHandle,
  onClose,
}: {
  member: FlowMember;
  model?: string;
  elapsed?: number;
  flows?: ReadonlyMap<string, FlowInfo>;
  onOpenHandle: (handle: string) => void;
  onClose: () => void;
}) {
  return (
    <PickFrame
      badge={member.chosen ? 'Chosen' : undefined}
      handle={member.handle}
      name={member.label}
      onClose={onClose}
      onOpenHandle={onOpenHandle}
      status={member.status}
      time={rowDuration(elapsed)}
    >
      <Fact label="Runs">
        <FlowName info={flows?.get(member.target)} name={member.targetLabel} />
      </Fact>
      {model ? <Fact label="Model">{model}</Fact> : null}
      {member.perspective ? <Fact label="Asked to answer as">{member.perspective}</Fact> : null}
      <TaskAnswer handle={member.handle} status={member.status} />
    </PickFrame>
  );
}

/** Fetch only the selected child's answer, shared by workflow steps and flow members. */
function TaskAnswer({ handle, status }: { handle?: string; status: FlowState }) {
  const settled = !['running', 'waiting', 'proposed'].includes(status.tone);
  const answer = useFlowTaskAnswer(handle, true, settled);
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-muted-foreground">Answer</p>
      {!handle ? (
        <p>Not started yet.</p>
      ) : answer.isPending ? (
        <p role="status">Loading the answer…</p>
      ) : answer.error ? (
        <p className="text-destructive" role="alert">
          The answer could not be loaded: {answer.error.message}
        </p>
      ) : answer.data ? (
        <ContentMarkdown className="max-h-72 overflow-auto rounded-md bg-muted/40 p-2 text-xs leading-5 [&_:is(h1,h2,h3,h4)]:mt-2 [&_:is(h1,h2,h3,h4)]:text-sm [&_:is(h1,h2,h3,h4)]:font-semibold">
          {answer.data}
        </ContentMarkdown>
      ) : (
        <p>{settled ? 'No answer was recorded.' : 'Still working.'}</p>
      )}
    </div>
  );
}

/** The judge's choice and rationale, or the council's synthesis. */
export function FlowVerdictView({
  flow,
  verdict,
  clamp = false,
}: {
  flow: string;
  verdict: FlowVerdict;
  /** Show a few lines with "Show all", for the transcript card. */
  clamp?: boolean;
}) {
  const [all, setAll] = useState(!clamp);
  const arena = flow === 'arena';
  const text = arena ? verdict.rationale : verdict.answer;
  if (!text) return null;
  return (
    <section
      aria-label={arena ? "The judge's choice" : 'The synthesis'}
      className="grid min-w-0 gap-1 text-sm"
    >
      <h4 className="text-xs font-medium text-muted-foreground">
        {arena
          ? verdict.winner !== undefined
            ? `The judge chose entry ${verdict.winner}`
            : "The judge's rationale"
          : 'Synthesis'}
      </h4>
      <div className={cn('relative min-w-0', !all && 'max-h-24 overflow-hidden')}>
        <ContentMarkdown className="text-sm leading-6">{text}</ContentMarkdown>
        {!all ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent"
          />
        ) : null}
      </div>
      {clamp ? (
        <Button className="h-auto w-fit p-0 text-xs" onClick={() => setAll(!all)} variant="link">
          {all ? 'Show less' : 'Show all'}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * What the agent wrote to start the flow: the workflow (every step's target,
 * instructions and dependencies) or a flow's request and options, readable,
 * with the exact JSON to copy.
 */
export function FlowScript({
  run,
  args,
  steps,
}: {
  run: FlowRun;
  args?: Record<string, unknown>;
  steps: readonly FlowStep[];
}) {
  const [asJson, setAsJson] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const json = flowScriptJson(run, args);
  const workflow = Boolean(run.view);
  const task = typeof args?.task === 'string' ? args.task : '';
  return (
    <details className="group/script min-w-0 rounded-md border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 text-muted-foreground transition-transform group-open/script:rotate-90 motion-reduce:transition-none"
        />
        {workflow ? 'Show the workflow' : 'Show what the agent asked'}
      </summary>
      <div className="grid min-w-0 gap-2 border-t p-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            aria-pressed={!asJson}
            className="h-6 px-2 text-xs"
            onClick={() => setAsJson(false)}
            size="xs"
            variant={asJson ? 'ghost' : 'secondary'}
          >
            Readable
          </Button>
          <Button
            aria-pressed={asJson}
            className="h-6 px-2 text-xs"
            onClick={() => setAsJson(true)}
            size="xs"
            variant={asJson ? 'secondary' : 'ghost'}
          >
            JSON
          </Button>
          <Button
            className="ml-auto h-6 px-2 text-xs"
            onClick={() =>
              copyText(json).then(
                () => setCopied('copied'),
                () => setCopied('failed'),
              )
            }
            size="xs"
            variant="outline"
          >
            <CopyIcon aria-hidden="true" className="size-3" />
            {copied === 'copied' ? 'Copied' : 'Copy JSON'}
          </Button>
        </div>
        {copied === 'failed' ? (
          <p className="text-xs text-destructive" role="alert">
            The clipboard is unavailable here; select the JSON to copy it.
          </p>
        ) : null}
        {asJson ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-xs leading-5">
            {json}
          </pre>
        ) : workflow ? (
          <div className="grid min-w-0 gap-2 text-xs leading-5">
            {task ? <Fact label="Task">{task}</Fact> : null}
            <WorkflowBounds view={run.view!} />
            <ol className="grid min-w-0 gap-2">
              {steps
                .filter((step) => step.kind !== 'proposal')
                .map((step, index) => (
                  <li className="grid min-w-0 gap-1" key={step.id}>
                    <p className="font-medium">
                      {index + 1}. {step.id}{' '}
                      <span className="font-normal text-muted-foreground">
                        runs {step.targetLabel}
                        {step.after.length ? `, after ${step.after.join(', ')}` : ', first'}
                        {step.addedBy ? `, added by ${step.addedBy}` : ''}
                      </span>
                    </p>
                    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-sans">
                      {inputText(step.input) || 'No instructions written.'}
                    </pre>
                  </li>
                ))}
            </ol>
          </div>
        ) : (
          <div className="grid min-w-0 gap-2 text-xs leading-5">
            <Instructions input={args?.input} title="Request" />
            <Fact label="Options">
              {args?.options && typeof args.options === 'object'
                ? JSON.stringify(args.options)
                : "none; the flow's defaults"}
            </Fact>
            {!args ? (
              <p className="text-muted-foreground">
                The request is shown in the conversation that started this flow.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * A workflow that can change while it runs says so with one tag; who may change it,
 * by how much, and whether you approve each change are on hover. A workflow nobody
 * may change says nothing: running as written is the expected case.
 */
export function WorkflowBounds({ view }: { view: WorkflowView }) {
  if (!view.editors.length) return null;
  const detail = `${editorBounds(view)}${view.approve_edits ? '. Added steps need your approval.' : '.'}`;
  return (
    <span
      aria-label={`Can change while running: ${detail}`}
      className="w-fit cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-4"
      tabIndex={0}
      title={detail}
    >
      Can change while running
    </span>
  );
}

/**
 * What the editors may do, as one sentence: a missing bound is no limit, said
 * once when neither is set.
 */
function editorBounds(view: WorkflowView): string {
  const steps = view.max_added_steps;
  const rounds = view.max_edit_rounds;
  const may =
    steps === null || steps === undefined
      ? 'may add steps'
      : `may add up to ${steps} ${steps === 1 ? 'step' : 'steps'}`;
  const over =
    rounds === null || rounds === undefined
      ? ''
      : ` over at most ${rounds} editing ${rounds === 1 ? 'round' : 'rounds'}`;
  const unbounded =
    (steps === null || steps === undefined) && (rounds === null || rounds === undefined)
      ? 'no limit set; '
      : '';
  const so = `${view.added} added, ${view.rounds} ${view.rounds === 1 ? 'round' : 'rounds'} so far`;
  return `Editors ${view.editors.join(', ')} ${may}${over} (${unbounded}${so})`;
}

/** Why a run ended without a result, on one line: a stall with its step, or a cancellation. */
export function FlowStall({
  cancelled,
  outcome,
  onOpenHandle,
  details = false,
}: {
  cancelled: boolean;
  outcome: FlowOutcome;
  onOpenHandle: (handle: string) => void;
  /** Add a disclosure with the typed reason and what the flow observed. */
  details?: boolean;
}) {
  // A cancelled run ended because someone asked it to: no fault to repair.
  const title = cancelled
    ? 'The flow was cancelled'
    : outcome.reason === 'flow_stall'
      ? 'The flow stalled'
      : 'The flow stopped';
  const open = outcome.handle ? (
    <Button
      className="h-6 w-fit px-2 text-xs"
      onClick={() => onOpenHandle(outcome.handle!)}
      size="xs"
      variant="outline"
    >
      {cancelled ? 'Open the cancelled step' : 'Open the stalled step'}
    </Button>
  ) : null;
  const facts = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">Reason</dt>
      <dd className="font-mono">{outcome.reason}</dd>
      {outcome.stall ? (
        <>
          <dt className="text-muted-foreground">Stall</dt>
          <dd className="font-mono">{outcome.stall}</dd>
        </>
      ) : null}
      {outcome.step ? (
        <>
          <dt className="text-muted-foreground">Step</dt>
          <dd className="font-mono">{outcome.step}</dd>
        </>
      ) : null}
      {outcome.predicate ? (
        <>
          <dt className="text-muted-foreground">Waiting for</dt>
          <dd className="font-mono">{outcome.predicate}</dd>
        </>
      ) : null}
    </dl>
  );
  return (
    <div
      className={cn(
        'grid min-w-0 gap-1 rounded-md border px-2 py-1.5 text-xs',
        cancelled ? 'bg-muted/40' : 'border-destructive/40 bg-destructive/5',
      )}
      role="status"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('font-medium', !cancelled && 'text-destructive')}>
          {title}
          {outcome.step ? ` at ${outcome.step}` : ''}:
        </span>
        <span className="min-w-[min(100%,14rem)] flex-1 [overflow-wrap:anywhere]">
          {outcome.message || 'No message was recorded.'}
        </span>
        {open}
      </div>
      {details ? (
        <details>
          <summary className="w-fit cursor-pointer text-muted-foreground">Details</summary>
          <div className="mt-1 grid gap-1">
            {facts}
            {outcome.observed !== undefined ? (
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono">
                {JSON.stringify(outcome.observed, null, 2)}
              </pre>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Proposed steps an editor added that wait for the person's approval. */
export function FlowApprovals({
  view,
  questions,
  onOpenQuestions,
}: {
  view: WorkflowView;
  questions: number;
  onOpenQuestions: () => void;
}) {
  if (!view.awaiting_approval.length) return null;
  return (
    <Alert>
      <AlertTitle>
        {view.awaiting_approval.length === 1
          ? 'A proposed step is waiting for your approval'
          : `${view.awaiting_approval.length} proposed steps are waiting for your approval`}
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
  );
}

/** What the person answered to each approval question, once answered. */
export function FlowApprovalDecisions({ run }: { run: FlowRun }) {
  const decisions = approvalDecisions(run);
  if (!decisions.length) return null;
  return (
    <ul className="grid gap-1 text-xs text-muted-foreground" aria-label="Your approvals">
      {decisions.map(({ step, approved }) => (
        <li key={`${step}:${approved}`}>
          You {approved ? 'approved' : 'declined'} adding the step{' '}
          <span className="font-mono text-foreground">{step}</span>.
        </li>
      ))}
    </ul>
  );
}
