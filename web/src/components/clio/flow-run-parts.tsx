import type { FlowOutcome, FlowRun, WorkflowView } from '@clio/core/v3';
import { ChevronRightIcon, CopyIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { ContentMarkdown } from './content-markdown';
import {
  flowScriptJson,
  inputText,
  type FlowStep,
  type FlowTone,
  type FlowVerdict,
} from './flow-run-presentation';
import { t, ph, plural } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

/** Each state's word in the legend, in the order the legend lists them. */
const TONE_WORDS: readonly (readonly [FlowTone, string])[] = [
  ['running', t({ message: 'running', context: 'flow step state' })],
  ['done', t`ran`],
  ['failed', t`stopped or rejected`],
  ['waiting', t({ message: 'waiting', context: 'flow step state' })],
  ['proposed', t({ message: 'awaiting approval', context: 'flow step state' })],
  ['cancelled', t`did not run or cancelled`],
  ['unknown', t({ message: 'not reported', context: 'flow step state' })],
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
    <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
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

/** One labelled fact in a step's or a request's details. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="min-w-0 [overflow-wrap:anywhere]">
      <span className="text-muted-foreground">{label}: </span>
      {children}
    </p>
  );
}

export function Instructions({ input, title = t`Instructions` }: { input: unknown; title?: string }) {
  const text = inputText(input);
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-muted-foreground">{title}</p>
      {text ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-sans text-xs leading-5 text-foreground">
          {text}
        </pre>
      ) : (
        <p>{t`None written; the step receives the workflow's task and the answers it waits on.`}</p>
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
      aria-label={arena ? t`The judge's choice` : t`The synthesis`}
      className="grid min-w-0 gap-1 text-sm"
    >
      <h4 className="text-xs font-medium text-muted-foreground">
        {arena
          ? verdict.winner !== undefined
            ? t`The judge chose entry ${ph({ winner: verdict.winner })}`
            : t`The judge's rationale`
          : t`Synthesis`}
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
          {all ? t`Show less` : t`Show all`}
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
        {workflow ? t`Show the workflow` : t`Input to the flow`}
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
            {t`Readable`}
          </Button>
          <Button
            aria-pressed={asJson}
            className="h-6 px-2 text-xs"
            onClick={() => setAsJson(true)}
            size="xs"
            variant={asJson ? 'secondary' : 'ghost'}
          >
            {t`JSON`}
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
            {copied === 'copied' ? t`Copied` : t`Copy JSON`}
          </Button>
        </div>
        {copied === 'failed' ? (
          <p className="text-xs text-destructive" role="alert">
            {t`The clipboard is unavailable here; select the JSON to copy it.`}
          </p>
        ) : null}
        {asJson ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-xs leading-5">
            {json}
          </pre>
        ) : workflow ? (
          <div className="grid min-w-0 gap-2 text-xs leading-5">
            {task ? <Fact label={t`Task`}>{task}</Fact> : null}
            <WorkflowBounds view={run.view!} />
            <ol className="grid min-w-0 gap-2">
              {steps
                .filter((step) => step.kind !== 'proposal')
                .map((step, index) => (
                  <li className="grid min-w-0 gap-1" key={step.id}>
                    <p className="font-medium">
                      {index + 1}. {step.id}{' '}
                      <span className="font-normal text-muted-foreground">
                        {scriptStepLine(step)}
                      </span>
                    </p>
                    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-sans">
                      {inputText(step.input) || t`No instructions written.`}
                    </pre>
                  </li>
                ))}
            </ol>
          </div>
        ) : (
          <div className="grid min-w-0 gap-2 text-xs leading-5">
            <Instructions input={args?.input} title={t`Request`} />
            <Fact label={t`Options`}>
              {args?.options && typeof args.options === 'object'
                ? JSON.stringify(args.options)
                : "none; the flow's defaults"}
            </Fact>
            {!args ? (
              <p className="text-muted-foreground">
                {t`The request is shown in the conversation that started this flow.`}
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
  const bounds = editorBounds(view);
  const detail = view.approve_edits
    ? t`${bounds}. Added steps need your approval.`
    : t({ message: `${bounds}.`, comment: 'A sentence ending' });
  return (
    <span
      aria-label={t`Can change while running: ${detail}`}
      className="w-fit cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-4"
      tabIndex={0}
      title={detail}
    >
      {t`Can change while running`}
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
  const stepsSet = steps !== null && steps !== undefined;
  const roundsSet = rounds !== null && rounds !== undefined;
  const editors = view.editors.join(', ');
  const soFar = t`${ph({ added: view.added })} added, ${plural(view.rounds, { one: '# round', other: '# rounds' })} so far`;
  if (!stepsSet && !roundsSet) return t`Editors ${editors} may add steps (no limit set; ${soFar})`;
  if (!roundsSet)
    return t`Editors ${editors} may add up to ${plural(steps ?? 0, { one: '# step', other: '# steps' })} (${soFar})`;
  if (!stepsSet)
    return t`Editors ${editors} may add steps over at most ${plural(rounds ?? 0, { one: '# editing round', other: '# editing rounds' })} (${soFar})`;
  return t`Editors ${editors} may add up to ${plural(steps ?? 0, { one: '# step', other: '# steps' })} over at most ${plural(rounds ?? 0, { one: '# editing round', other: '# editing rounds' })} (${soFar})`;
}

/** A workflow step in the script, after its number and id: what it runs, after what, and who added it. */
function scriptStepLine(step: Pick<FlowStep, 'targetLabel' | 'after' | 'addedBy'>): string {
  const target = step.targetLabel;
  const after = step.after.join(', ');
  const by = step.addedBy;
  if (after)
    return by
      ? t`runs ${target}, after ${after}, added by ${by}`
      : t`runs ${target}, after ${after}`;
  return by ? t`runs ${target}, first, added by ${by}` : t`runs ${target}, first`;
}

/** A proposal awaiting approval, after its id: what it runs, after what, who proposed it and why. */
function proposalLine(proposal: WorkflowView['awaiting_approval'][number]): string {
  const target = proposal.target;
  const after = proposal.after.join(', ');
  const by = proposal.by;
  const line = after
    ? by
      ? t`runs ${target} after ${after}, proposed by ${by}`
      : t`runs ${target} after ${after}`
    : by
      ? t`runs ${target}, proposed by ${by}`
      : t`runs ${target}`;
  const reason = proposal.reason;
  return reason ? t`${line}: ${reason}` : line;
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
  // A run stopped on request names who stopped it, not the call the stop cancelled.
  const stopped = outcome.reason === 'stopped';
  // A cancelled run ended because someone asked it to: no fault to repair.
  const title = stopped
    ? outcome.stopped_by === 'person'
      ? t`You stopped this run`
      : outcome.stopped_by === 'agent'
        ? t`An agent stopped this run`
        : t`This run was stopped`
    : cancelled
    ? t`The flow was cancelled`
    : outcome.stall === 'research_blocked'
      ? t`Research was blocked`
      : outcome.reason === 'flow_stall'
        ? t`The flow stalled`
        : t`The flow stopped`;
  const open = outcome.handle ? (
    <Button
      className="h-6 w-fit px-2 text-xs"
      onClick={() => onOpenHandle(outcome.handle!)}
      size="xs"
      variant="outline"
    >
      {stopped
        ? t`Open the step it stopped at`
        : cancelled
          ? t`Open the cancelled step`
          : t`Open the stalled step`}
    </Button>
  ) : null;
  const facts = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">{t`Reason`}</dt>
      <dd className="font-mono">{outcome.reason}</dd>
      {outcome.stall ? (
        <>
          <dt className="text-muted-foreground">{t`Stall`}</dt>
          <dd className="font-mono">{outcome.stall}</dd>
        </>
      ) : null}
      {stopped && outcome.ended_by?.message ? (
        <>
          <dt className="text-muted-foreground">{t`The flow saw`}</dt>
          <dd>{outcome.ended_by.message}</dd>
        </>
      ) : null}
      {outcome.step ? (
        <>
          <dt className="text-muted-foreground">{t`Step`}</dt>
          <dd className="font-mono">{outcome.step}</dd>
        </>
      ) : null}
      {outcome.predicate ? (
        <>
          <dt className="text-muted-foreground">{t`Waiting for`}</dt>
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
          {stopped
            ? outcome.stop_reason === 'conversation_stop'
              ? t`Stopped with this conversation's Stop. A restart keeps the steps that finished.`
              : t`A restart keeps the steps that finished.`
            : outcome.message || t`No message was recorded.`}
        </span>
        {open}
      </div>
      {details ? (
        <details>
          <summary className="w-fit cursor-pointer text-muted-foreground">{t`Details`}</summary>
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
        {plural(view.awaiting_approval.length, {
          one: 'A proposed step is waiting for your approval',
          other: '# proposed steps are waiting for your approval',
        })}
      </AlertTitle>
      <AlertDescription className="grid gap-2">
        <ul className="grid gap-1.5">
          {view.awaiting_approval.map((proposal) => (
            <li key={proposal.id}>
              <Trans>
                <span className="font-medium">{proposal.id}</span> {proposalLine(proposal)}
              </Trans>
            </li>
          ))}
        </ul>
        {questions ? (
          <Button className="w-fit" onClick={onOpenQuestions} size="sm">
            {t`Answer the approval question`}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
