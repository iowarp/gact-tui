import type { FlowOutcome, FlowRun, PlanView } from '@clio/core/v3';
import { CheckIcon, ChevronRightIcon, CopyIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFlowTaskAnswer } from '@/hooks/use-flow-run';
import { rowDuration } from '@/hooks/use-flow-presentation';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { ContentMarkdown } from './content-markdown';
import {
  flowScriptJson,
  inputText,
  type FlowMember,
  type FlowState,
  type FlowStep,
  type FlowVerdict,
} from './flow-run-presentation';
import { ClioStatus } from './status';

/**
 * One line per step: its state in words, its name, who runs it, how long it
 * took, and Open. Expanding the row shows what the agent wrote for it.
 */
function FlowRow({
  status,
  title,
  target,
  time,
  badge,
  handle,
  onOpenHandle,
  openLabel,
  children,
  defaultOpen = false,
  onToggle,
}: {
  status: FlowState;
  title: string;
  target: string;
  time?: string;
  badge?: ReactNode;
  handle?: string;
  onOpenHandle: (handle: string) => void;
  openLabel: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="min-w-0 rounded-md border bg-card/60" data-state={open ? 'open' : 'closed'}>
      <div className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm">
        <button
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} details of ${title}`}
          className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setOpen(!open);
            onToggle?.(!open);
          }}
          type="button"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
          <ClioStatus
            className="shrink-0 px-1.5 py-0 text-[11px]"
            label={status.label}
            value={status.value}
          />
          <span className="min-w-0 max-w-full truncate font-medium">{title}</span>
          {badge}
          <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground @min-[26rem]:block">
            {target}
          </span>
          {time ? (
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              {time}
            </span>
          ) : null}
        </button>
        {handle ? (
          <Button
            aria-label={openLabel}
            className="h-6 shrink-0 px-2 text-xs"
            onClick={() => onOpenHandle(handle)}
            size="xs"
            variant="ghost"
          >
            Open
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="grid min-w-0 gap-2 border-t px-3 py-2 text-xs leading-5">{children}</div>
      ) : null}
    </li>
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
        <p>None written; the step receives the plan&apos;s task and the answers it waits on.</p>
      )}
    </div>
  );
}

/** The plan's steps, one line each, in plan order. */
export function FlowStepRows({
  steps,
  elapsed,
  onOpenHandle,
}: {
  steps: readonly FlowStep[];
  elapsed: ReadonlyMap<string, number>;
  onOpenHandle: (handle: string) => void;
}) {
  return (
    <ol aria-label="Plan steps" className="@container grid min-w-0 gap-1">
      {steps.map((step) => (
        <FlowRow
          badge={
            step.kind === 'flow' ? (
              <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="outline">
                Flow
              </Badge>
            ) : step.kind === 'editor' ? (
              <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="outline">
                Editor
              </Badge>
            ) : step.addedBy ? (
              <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="outline">
                {step.kind === 'proposal' ? 'Proposed' : 'Added'}
              </Badge>
            ) : null
          }
          handle={step.handle}
          key={step.id}
          onOpenHandle={onOpenHandle}
          openLabel={`Open step ${step.id}`}
          status={step.status}
          target={step.targetLabel}
          time={rowDuration(elapsed.get(step.id))}
          title={step.id}
        >
          <Fact label="Runs">{step.targetLabel}</Fact>
          <Fact label="Waits on">
            {step.after.length ? step.after.join(', ') : 'nothing; starts first'}
          </Fact>
          {step.addedBy ? (
            <Fact label={step.kind === 'proposal' ? 'Proposed by' : 'Added by'}>
              {step.addedBy}
              {step.note ? ` — ${step.note}` : ''}
            </Fact>
          ) : step.note ? (
            <Fact label="Description">{step.note}</Fact>
          ) : null}
          <Instructions input={step.input} />
        </FlowRow>
      ))}
    </ol>
  );
}

/** Council members or arena entries, each expandable to the answer it gave. */
export function FlowMemberRows({
  members,
  elapsed,
  onOpenHandle,
  expandChosen = false,
}: {
  members: readonly FlowMember[];
  elapsed: ReadonlyMap<string, number>;
  onOpenHandle: (handle: string) => void;
  /** Open the judge's chosen entry from the start. */
  expandChosen?: boolean;
}) {
  return (
    <ol aria-label="Flow members" className="@container grid min-w-0 gap-1">
      {members.map((member) => (
        <MemberRow
          elapsed={elapsed.get(member.key)}
          expanded={expandChosen && member.chosen}
          key={member.key}
          member={member}
          onOpenHandle={onOpenHandle}
        />
      ))}
    </ol>
  );
}

function MemberRow({
  member,
  elapsed,
  expanded,
  onOpenHandle,
}: {
  member: FlowMember;
  elapsed?: number;
  expanded: boolean;
  onOpenHandle: (handle: string) => void;
}) {
  const [open, setOpen] = useState(expanded);
  const settled = !['running', 'waiting'].includes(member.status.tone);
  const answer = useFlowTaskAnswer(member.handle, open, settled);
  return (
    <FlowRow
      badge={
        member.chosen ? (
          <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="secondary">
            <CheckIcon aria-hidden="true" className="size-3" /> Chosen
          </Badge>
        ) : null
      }
      defaultOpen={expanded}
      handle={member.handle}
      onOpenHandle={onOpenHandle}
      onToggle={setOpen}
      openLabel={`Open ${member.label}`}
      status={member.status}
      target={
        member.perspective ? `${member.targetLabel}, as ${member.perspective}` : member.targetLabel
      }
      time={rowDuration(elapsed)}
      title={member.label}
    >
      <Fact label="Runs">{member.targetLabel}</Fact>
      {member.perspective ? <Fact label="Asked to answer as">{member.perspective}</Fact> : null}
      <div className="grid min-w-0 gap-1">
        <p className="text-muted-foreground">Answer</p>
        {!member.handle ? (
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
    </FlowRow>
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
 * What the agent wrote to start the flow: the plan (every step's target,
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
  const plan = Boolean(run.view);
  const task = typeof args?.task === 'string' ? args.task : '';
  return (
    <details className="group/script min-w-0 rounded-md border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 text-muted-foreground transition-transform group-open/script:rotate-90 motion-reduce:transition-none"
        />
        {plan ? 'Show the plan' : 'Show what the agent asked'}
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
        ) : plan ? (
          <div className="grid min-w-0 gap-2 text-xs leading-5">
            {task ? <Fact label="Task">{task}</Fact> : null}
            <PlanBounds view={run.view!} />
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

/** The plan's editing bounds in words. */
export function PlanBounds({ view }: { view: PlanView }) {
  return (
    <p className="text-xs text-muted-foreground">
      {view.editors.length
        ? `Editors ${view.editors.join(', ')} may add up to ${view.max_added ?? 'any number of'} steps over ${view.max_rounds ?? 'any number of'} editing rounds (${view.added} added, ${view.rounds} ${view.rounds === 1 ? 'round' : 'rounds'} so far)`
        : 'No editors; the plan runs as written'}
      {view.approve_edits ? '. Added steps need your approval.' : '.'}
    </p>
  );
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
  view: PlanView;
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
