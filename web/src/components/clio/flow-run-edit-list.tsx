import type { FlowRun } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  editOrigin,
  editOutcomeText,
  workflowEdits,
  type FlowQuestion,
  type WorkflowEdit,
} from './flow-run-edits';
import type { FlowStep } from './flow-run-presentation';
import { t, ph } from '@lingui/core/macro';

/** A question's state and answer in words. */
function questionAnswer(question: FlowQuestion): string {
  if (question.status === 'answered') {
    const answer = question.answer;
    if (question.answeredBy === 'agent')
      return answer
        ? t`An agent answered: ${answer}`
        : t`An agent answered without a recorded choice`;
    return answer ? t`You answered: ${answer}` : t`You answered without a recorded choice`;
  }
  if (question.status === 'pending') return t`Waiting for your answer`;
  return t`Not answered: ${ph({ status: question.status })}`;
}

/** The question's subject, in words. */
function questionSubject(question: FlowQuestion): string {
  const step = question.step;
  if (!step) return question.about === 'fork' ? t`A fork` : t`An added step`;
  return question.about === 'fork' ? t`A fork of ${step}` : t`Adding ${step}`;
}

/**
 * How a workflow changed while it ran, where each change happened: the
 * editors' proposals with what became of them (a rejection with its typed
 * reason), cancelled steps, and the approval questions with your answers.
 * Each row opens the step it happened in. Nothing when the run did not change.
 */
export function FlowEdits({
  run,
  steps,
  questions,
  onOpenHandle,
  showAwaiting = true,
}: {
  run: FlowRun;
  /** The run's steps, to open the step a change happened in. */
  steps: readonly FlowStep[];
  questions: readonly FlowQuestion[];
  onOpenHandle: (handle: string) => void;
  /** List proposals that still wait for approval (off where they are listed already). */
  showAwaiting?: boolean;
}) {
  const edits = workflowEdits(run).filter((edit) => showAwaiting || edit.outcome !== 'awaiting');
  if (!edits.length && !questions.length) return null;
  const handles = new Map(steps.flatMap((step) => (step.handle ? [[step.id, step.handle]] : [])));
  const open = (step: string, label: string) => {
    const handle = handles.get(step);
    return handle ? (
      <Button
        aria-label={t`Open ${step}, ${label}`}
        className="h-5 px-1.5 text-caption"
        onClick={() => onOpenHandle(handle)}
        size="xs"
        type="button"
        variant="ghost"
      >
        {t`Open ${step}`}
      </Button>
    ) : null;
  };
  return (
    <section
      aria-label={t`Changes while it ran`}
      className="grid min-w-0 gap-1.5 rounded-md border px-2 py-1.5 text-xs"
      data-slot="flow-edits"
    >
      <h4 className="font-medium text-muted-foreground">{t`Changes while it ran`}</h4>
      {edits.length ? (
        <ul aria-label={t`Edits`} className="grid min-w-0 gap-1">
          {edits.map((edit, index) => (
            <EditRow edit={edit} key={`${edit.step}:${index}`} open={open} />
          ))}
        </ul>
      ) : null}
      {questions.length ? (
        <ul aria-label={t`Approval questions`} className="grid min-w-0 gap-1">
          {questions.map((question) => (
            <li className="grid min-w-0 gap-0.5" key={question.id}>
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">{t`Question: ${ph({ subject: questionSubject(question) })}`}</span>
                {question.step ? open(question.step, t`where it was asked`) : null}
              </p>
              <p className="min-w-0 [overflow-wrap:anywhere]">{question.prompt}</p>
              <p className="min-w-0 font-medium [overflow-wrap:anywhere]">
                {questionAnswer(question)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EditRow({
  edit,
  open,
}: {
  edit: WorkflowEdit;
  open: (step: string, label: string) => ReactNode;
}) {
  const origin = editOrigin(edit.by);
  const cancelled = edit.outcome === 'cancelled' || edit.outcome === 'cancel_refused';
  const step = edit.step;
  const target = edit.target;
  const after = edit.after.join(', ');
  const what = cancelled
    ? t`Cancel ${step}`
    : target && after
      ? t`${step} runs ${target} after ${after}`
      : target
        ? t`${step} runs ${target}`
        : after
          ? t`${step} after ${after}`
          : step;
  const repair = edit.by.startsWith('repair:');
  const by = !edit.by
    ? ''
    : cancelled
      ? repair
        ? t`asked by ${origin} (a repair)`
        : t`asked by ${origin}`
      : repair
        ? t`proposed by ${origin} (a repair)`
        : t`proposed by ${origin}`;
  return (
    <li className="grid min-w-0 gap-0.5">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="font-mono">{what}</span>
        <span className="text-muted-foreground">{by}</span>
        {origin ? open(origin, t`where it was proposed`) : null}
      </p>
      <p className="min-w-0 [overflow-wrap:anywhere]">
        <span className="font-medium">{editOutcomeText(edit)}</span>
        {edit.reason ? (
          <span className="ml-1.5 font-mono text-muted-foreground" title={t`Recorded reason`}>
            ({edit.reason})
          </span>
        ) : null}
        {edit.note ? <span className="text-muted-foreground"> ({edit.note})</span> : null}
      </p>
    </li>
  );
}

/** The approval questions about one step, with the answers, for its details. */
export function StepQuestions({ questions }: { questions: readonly FlowQuestion[] }) {
  if (!questions.length) return null;
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-muted-foreground">
        {questions.length === 1 ? t`Approval question` : t`Approval questions`}
      </p>
      <ul className="grid min-w-0 gap-1">
        {questions.map((question) => (
          <li className="min-w-0 [overflow-wrap:anywhere]" key={question.id}>
            {question.prompt} <span className="font-medium">— {questionAnswer(question)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
