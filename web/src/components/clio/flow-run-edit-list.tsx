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

/** A question's state and answer in words. */
function questionAnswer(question: FlowQuestion): string {
  if (question.status === 'answered') {
    const who = question.answeredBy === 'agent' ? 'An agent answered' : 'You answered';
    return question.answer ? `${who}: ${question.answer}` : `${who} without a recorded choice`;
  }
  if (question.status === 'pending') return 'Waiting for your answer';
  return `Not answered: ${question.status}`;
}

/** The question's subject, in words. */
function questionSubject(question: FlowQuestion): string {
  if (!question.step) return question.about === 'fork' ? 'A fork' : 'An added step';
  return question.about === 'fork' ? `A fork of ${question.step}` : `Adding ${question.step}`;
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
        aria-label={`Open ${step}, ${label}`}
        className="h-5 px-1.5 text-[11px]"
        onClick={() => onOpenHandle(handle)}
        size="xs"
        type="button"
        variant="ghost"
      >
        Open {step}
      </Button>
    ) : null;
  };
  return (
    <section
      aria-label="Changes while it ran"
      className="grid min-w-0 gap-1.5 rounded-md border px-2 py-1.5 text-xs"
      data-slot="flow-edits"
    >
      <h4 className="font-medium text-muted-foreground">Changes while it ran</h4>
      {edits.length ? (
        <ul aria-label="Edits" className="grid min-w-0 gap-1">
          {edits.map((edit, index) => (
            <EditRow edit={edit} key={`${edit.step}:${index}`} open={open} />
          ))}
        </ul>
      ) : null}
      {questions.length ? (
        <ul aria-label="Approval questions" className="grid min-w-0 gap-1">
          {questions.map((question) => (
            <li className="grid min-w-0 gap-0.5" key={question.id}>
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-muted-foreground">Question: {questionSubject(question)}</span>
                {question.step ? open(question.step, 'where it was asked') : null}
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
  const what = cancelled
    ? `Cancel ${edit.step}`
    : `${edit.step}${edit.target ? ` runs ${edit.target}` : ''}${
        edit.after.length ? ` after ${edit.after.join(', ')}` : ''
      }`;
  return (
    <li className="grid min-w-0 gap-0.5">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="font-mono">{what}</span>
        <span className="text-muted-foreground">
          {edit.by
            ? `${cancelled ? 'asked' : 'proposed'} by ${origin}${edit.by.startsWith('repair:') ? ' (a repair)' : ''}`
            : ''}
        </span>
        {origin ? open(origin, 'where it was proposed') : null}
      </p>
      <p className="min-w-0 [overflow-wrap:anywhere]">
        <span className="font-medium">{editOutcomeText(edit)}</span>
        {edit.reason ? (
          <span className="ml-1.5 font-mono text-muted-foreground" title="Recorded reason">
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
        {questions.length === 1 ? 'Approval question' : 'Approval questions'}
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
