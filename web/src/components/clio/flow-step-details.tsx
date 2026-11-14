import type { FlowRunUsage } from '@clio/core/v3';
import { MessagesSquareIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFlowTaskAnswer, useFlowTaskInput } from '@/hooks/use-flow-run';
import { rowDuration, type FlowInfo } from '@/hooks/use-flow-presentation';
import { callModel } from '@/lib/flow-run-usage';
import { ContentMarkdown } from './content-markdown';
import type { FlowMember, FlowState } from './flow-run-presentation';
import { FlowName } from './flow-name';
import type { FlowQuestion } from './flow-run-edits';
import { StepQuestions } from './flow-run-edit-list';
import { Fact, FlowVerdictView, Instructions } from './flow-run-parts';
import { StepFolder } from './node-folder';
import type { FlowPick } from './flow-railroad';
import { ClioStatus } from './status';
import { t, ph } from '@lingui/core/macro';

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
  questions = [],
  sessionId,
  onOpenHandle,
  onClose,
}: {
  pick: FlowPick;
  /** The conversation that started the run, whose task index holds each step's input. */
  sessionId?: string;
  /** The run's approval questions; a step shows those about it. */
  questions?: readonly FlowQuestion[];
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
              ? t`It did not run.`
              : pick.flow === 'arena'
                ? t`It runs once every entry has answered.`
                : t`It runs once every member has answered.`}
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
        sessionId={sessionId}
      />
    );
  }
  const step = pick.step;
  const agent = step.targetLabel || step.label || step.id;
  return (
    <PickFrame
      badge={
        step.forkOf
          ? t`Fork`
          : step.kind === 'flow'
            ? t`Flow`
            : step.kind === 'editor'
              ? t`Editor`
              : step.addedBy
                ? step.kind === 'proposal'
                  ? t`Proposed`
                  : t`Added`
                : undefined
      }
      handle={step.handle}
      name={step.label ?? step.id}
      onClose={onClose}
      onOpenHandle={onOpenHandle}
      status={step.status}
      time={rowDuration(elapsed.get(step.id))}
    >
      {step.kind !== 'action' ? (
        <StepInput
          agent={agent}
          handle={step.handle}
          input={step.input}
          sessionId={sessionId}
          written={!step.label || step.input !== undefined}
        />
      ) : null}
      {step.handle ? <TaskAnswer agent={agent} handle={step.handle} status={step.status} /> : null}
      <StepQuestions
        questions={questions.filter((question) => question.step === (step.forkOf ?? step.id))}
      />
      <div className="grid min-w-0 gap-0.5 border-t pt-2">
        {step.asked ? <Fact label={t`Investigates`}>{step.asked}</Fact> : null}
        {step.targetLabel ? (
          <Fact label={step.kind === 'flow' ? t`Flow` : t`Agent`}>
            {step.kind === 'flow' ? (
              <FlowName info={flows?.get(step.target)} name={step.targetLabel} />
            ) : (
              step.targetLabel
            )}
          </Fact>
        ) : null}
        {!step.label ? (
          <Fact label={t`Waits on`}>
            {step.after.length
              ? step.after.map((id) => (id.startsWith('run:') ? id.slice(4) : id)).join(', ')
              : t`nothing; starts first`}
          </Fact>
        ) : null}
        {callModel(usage, step.handle) ? (
          <Fact label={t`Model`}>{callModel(usage, step.handle)}</Fact>
        ) : null}
        {step.attempts > 1 ? <Fact label={t`Attempts`}>{step.attempts}</Fact> : null}
        {step.forkOf ? <Fact label={t`Fork of`}>{step.forkOf}</Fact> : null}
        {step.alsoWaitsOn?.length ? (
          <Fact label={t`Also waits on its forks`}>{step.alsoWaitsOn.join(', ')}</Fact>
        ) : null}
        {step.forkOf && step.note ? (
          <Fact label={t`Fork note`}>{step.note}</Fact>
        ) : step.addedBy ? (
          <Fact label={step.kind === 'proposal' ? t`Proposed by` : t`Added by`}>
            {step.addedBy}
            {step.note ? `: ${step.note}` : ''}
          </Fact>
        ) : step.note ? (
          <Fact label={t`What happened`}>{step.note}</Fact>
        ) : null}
        <StepFolder handle={step.handle} name={step.label ?? step.id} />
      </div>
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
          className="shrink-0 px-1.5 py-0 text-caption"
          label={status.label}
          value={status.value}
        />
        <span className="min-w-0 truncate font-medium">{name}</span>
        {badge ? (
          <Badge className="shrink-0 px-1.5 py-0 text-[0.625rem]" variant="outline">
            {badge}
          </Badge>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {time ? <span className="text-xs tabular-nums text-muted-foreground">{time}</span> : null}
          {handle && onOpenHandle ? (
            <Button
              aria-label={t`See ${name}'s conversation`}
              className="h-6 px-2 text-xs"
              onClick={() => onOpenHandle(handle)}
              size="xs"
              variant="outline"
            >
              <MessagesSquareIcon aria-hidden="true" className="size-3.5" />
              {t`See conversation`}
            </Button>
          ) : null}
          <Button
            aria-label={t`Close ${name}`}
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
  sessionId,
  onOpenHandle,
  onClose,
}: {
  member: FlowMember;
  model?: string;
  sessionId?: string;
  elapsed?: number;
  flows?: ReadonlyMap<string, FlowInfo>;
  onOpenHandle: (handle: string) => void;
  onClose: () => void;
}) {
  return (
    <PickFrame
      badge={member.chosen ? t`Chosen` : undefined}
      handle={member.handle}
      name={member.label}
      onClose={onClose}
      onOpenHandle={onOpenHandle}
      status={member.status}
      time={rowDuration(elapsed)}
    >
      <StepInput
        agent={member.label}
        handle={member.handle}
        input={undefined}
        sessionId={sessionId}
        written={false}
      />
      <TaskAnswer agent={member.label} handle={member.handle} status={member.status} />
      <div className="grid min-w-0 gap-0.5 border-t pt-2">
        <Fact label={t`Agent`}>
          <FlowName info={flows?.get(member.target)} name={member.targetLabel} />
        </Fact>
        {model ? <Fact label={t`Model`}>{model}</Fact> : null}
        {member.perspective ? (
          <Fact label={t`Asked to answer as`}>{member.perspective}</Fact>
        ) : null}
      </div>
    </PickFrame>
  );
}

/**
 * What the selected step was given. A workflow step's written instructions come
 * with the run; a flow's call was given its assignment text, read from the task
 * index once the step is selected.
 */
function StepInput({
  agent,
  handle,
  input,
  sessionId,
  written,
}: {
  agent: string;
  handle?: string;
  input: unknown;
  sessionId?: string;
  /** The run carries this step's instructions (a workflow step). */
  written: boolean;
}) {
  const title = t`Input to ${agent}`;
  const fetched = useFlowTaskInput(sessionId, handle, !written);
  if (written) return <Instructions input={input} title={title} />;
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-muted-foreground">{title}</p>
      {!handle ? (
        <p>{t`Not started yet.`}</p>
      ) : fetched.isPending ? (
        <p role="status">{t`Loading the input…`}</p>
      ) : fetched.error ? (
        <p className="text-destructive" role="alert">
          {t`The input could not be loaded: ${ph({ message: fetched.error.message })}`}
        </p>
      ) : fetched.data ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-sans text-xs leading-5 text-foreground">
          {fetched.data}
        </pre>
      ) : (
        <p>{t`Not recorded here. See conversation shows what it was given.`}</p>
      )}
    </div>
  );
}

/** Fetch only the selected child's answer, shared by workflow steps and flow members. */
function TaskAnswer({
  agent,
  handle,
  status,
}: {
  agent: string;
  handle?: string;
  status: FlowState;
}) {
  const settled = !['running', 'waiting', 'proposed'].includes(status.tone);
  const answer = useFlowTaskAnswer(handle, true, settled);
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-muted-foreground">{t`Answer from ${agent}`}</p>
      {!handle ? (
        <p>{t`Not started yet.`}</p>
      ) : answer.isPending ? (
        <p role="status">{t`Loading the answer…`}</p>
      ) : answer.error ? (
        <p className="text-destructive" role="alert">
          {t`The answer could not be loaded: ${ph({ message: answer.error.message })}`}
        </p>
      ) : answer.data ? (
        <ContentMarkdown className="max-h-72 overflow-auto rounded-md bg-muted/40 p-2 text-xs leading-5 [&_:is(h1,h2,h3,h4)]:mt-2 [&_:is(h1,h2,h3,h4)]:text-sm [&_:is(h1,h2,h3,h4)]:font-semibold">
          {answer.data}
        </ContentMarkdown>
      ) : (
        <p>{settled ? t`No answer was recorded.` : t`Still working.`}</p>
      )}
    </div>
  );
}
