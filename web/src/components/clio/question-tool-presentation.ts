import type { PendingInteraction, ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { interactionAnswerLabels, isCausalQuestionInteraction } from './agent-answer-domain';
import { ph, t, plural } from '@lingui/core/macro';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function questionInput(tool: ToolInvocation): Record<string, unknown> | undefined {
  const input = record(tool.input);
  return record(input?.kwargs) ?? input;
}

function questions(tool: ToolInvocation): Record<string, unknown>[] {
  if (tool.name !== 'ask_user') return [];
  const input = questionInput(tool);
  const bundle = input?.questions;
  if (Array.isArray(bundle) && bundle.length) {
    const rows = bundle.map(record);
    if (rows.every((row) => typeof row?.question === 'string' && row.question.trim()))
      return rows as Record<string, unknown>[];
  }
  return typeof input?.question === 'string' && input.question.trim() ? [input] : [];
}

/** Name the authored questions rather than the transport's generic task operation. */
export function questionToolSummary(tool: ToolInvocation): string | undefined {
  const count = questions(tool).length;
  return count ? plural(count, { one: '# question', other: '# questions' }) : undefined;
}

/** The questions this call asked, linked by `source.invocation_id` (or its receipt's task handle). */
function questionLink(
  tool: ToolInvocation,
  interactions: readonly PendingInteraction[],
): { accepted: boolean; matches: PendingInteraction[] } {
  let output = tool.output;
  if (Array.isArray(output) && output.length === 1) output = record(output[0])?.text;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      output = undefined;
    }
  }
  const outer = record(output);
  const receipt = record(outer?.structuredContent) ?? record(outer?.structured_content) ?? outer;
  // The server links a question to its call by `source.invocation_id`; older sessions
  // only carry the task handle from the call's receipt.
  const linked = interactions.filter(
    (row) => row.source.invocation_id === tool.id && isCausalQuestionInteraction(row),
  );
  const accepted = linked.length > 0 || (receipt?.kind === 'Question' && receipt.accepted === true);
  const matches = linked.length
    ? linked
    : accepted
      ? interactions.filter((row) => row.task_id === receipt?.handle)
      : [];
  return { accepted, matches };
}

export interface AnsweredQuestion {
  prompt: string;
  options: { label: string; description?: string; chosen: boolean }[];
}

export interface QuestionReading {
  framing?: string;
  reason?: string;
  questions: AnsweredQuestion[];
  /** What the person wrote rather than picked. */
  written: string[];
}

/** An answered ask, for its reader: each question, its options with the chosen ones, and any typed answer. */
export function answeredQuestionReading(
  tool: ToolInvocation,
  interactions: readonly PendingInteraction[] = [],
): QuestionReading | undefined {
  const rows = questions(tool);
  if (!rows.length || ['failed', 'denied', 'cancelled', 'unknown'].includes(tool.state)) return;
  const answers = questionLink(tool, interactions)
    .matches.filter((row) => row.status === 'answered')
    .flatMap(interactionAnswerLabels);
  if (!answers.length) return;
  const picked = new Set(answers);
  const questionsRead = rows.map((question): AnsweredQuestion => {
    const options = Array.isArray(question.options)
      ? question.options.flatMap((value) => {
          const option = record(value);
          return typeof option?.label === 'string'
            ? [
                {
                  label: option.label,
                  description:
                    typeof option.description === 'string' && option.description.trim()
                      ? option.description
                      : undefined,
                  chosen: picked.has(option.label),
                },
              ]
            : [];
        })
      : question.kind === 'confirmation'
        ? ['Yes', 'No'].map((label) => ({ label, chosen: picked.has(label) }))
        : [];
    return { prompt: String(question.question), options };
  });
  const offered = new Set(
    questionsRead.flatMap((question) => question.options.map((o) => o.label)),
  );
  const input = questionInput(tool);
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
  return {
    framing: Array.isArray(input?.questions) ? text(input?.question) : undefined,
    reason: text(input?.reason),
    questions: questionsRead,
    written: answers.filter((answer) => !offered.has(answer)),
  };
}

/** Present current and retained ask_user calls from their exact typed arguments. */
export function withQuestionPresentation(
  tool: ToolInvocation,
  interactions: readonly PendingInteraction[] = [],
): ToolInvocation {
  const rows = questions(tool);
  const identity = tool.presentation?.blocks.find(
    (block) => block.id === tool.presentation?.subject && /^task-\d+-identity$/u.test(block.id),
  );
  if (tool.name === 'ask_user' && !rows.length && identity) {
    // A call with no question has nothing to name; the transport's "Task" is no target.
    return {
      ...tool,
      presentation: {
        ...tool.presentation!,
        subject: undefined,
        blocks: tool.presentation!.blocks.filter((block) => block !== identity),
      },
    };
  }
  if (rows.length && tool.state === 'failed') {
    // A rejected ask names the question it tried, not the transport's "Task".
    const prompt = String(rows[0]!.question);
    const kept = (tool.presentation?.blocks ?? []).filter((block) => block.severity === 'error');
    return {
      ...tool,
      presentation: {
        ...tool.presentation,
        status: tool.presentation?.status ?? 'failed',
        action: t`Ask you`,
        subject: 'question-subject',
        summary: '',
        blocks: [{ id: 'question-subject', type: 'text', text: prompt }, ...kept],
      },
    };
  }
  if (!rows.length || ['failed', 'denied', 'cancelled', 'unknown'].includes(tool.state))
    return tool;
  const blocks: ToolPresentationBlock[] = rows.flatMap((question, index) => {
    const options = Array.isArray(question.options)
      ? question.options.flatMap((value) => {
          const option = record(value);
          return typeof option?.label === 'string'
            ? [
                option.label +
                  (typeof option.description === 'string' && option.description
                    ? `: ${option.description}`
                    : ''),
              ]
            : [];
        })
      : question.kind === 'confirmation'
        ? [t`Yes`, t`No`]
        : [];
    return [
      {
        id: `question-prompt-${index}`,
        type: 'text',
        label: rows.length === 1 ? t`Question` : t`Question ${ph({ number: index + 1 })}`,
        text:
          String(question.question) +
          (options.length
            ? `\n\n${t`Options:`}\n${options.map((option) => `• ${option}`).join('\n')}`
            : ''),
      },
    ];
  });
  const reason = questionInput(tool)?.reason;
  const framing = questionInput(tool)?.question;
  if (
    Array.isArray(questionInput(tool)?.questions) &&
    typeof framing === 'string' &&
    framing.trim()
  )
    blocks.unshift({ id: 'question-framing', type: 'text', text: framing });
  if (typeof reason === 'string' && reason.trim())
    blocks.push({ id: 'question-reason', type: 'text', label: t`Why I’m asking`, text: reason });
  const { accepted, matches } = questionLink(tool, interactions);
  const interaction = matches.find((row) => row.status === 'pending') ?? matches[0];
  // Once answered, the ask folds into the spec's decision row: "Answered · 2020–2023".
  const answers = matches
    .filter((row) => row.status === 'answered')
    .flatMap(interactionAnswerLabels);
  if (accepted) {
    const status = interaction?.status;
    blocks.push({
      id: 'question-state',
      type: 'text',
      label: t`Answer`,
      text:
        status === 'pending'
          ? t`Waiting for your answer`
          : status === 'answered'
            ? answers.join(', ') || 'Answered'
            : status === 'cancelled'
              ? t`Cancelled`
              : status === 'expired'
                ? t`Expired`
                : t`Answer requested at this step`,
    });
  }
  if (answers.length)
    blocks.unshift({ id: 'question-answer', type: 'text', text: answers.join(', ') });
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      action: answers.length ? t`Answered` : t`Ask you`,
      subject: answers.length ? 'question-answer' : undefined,
      summary: answers.length
        ? ''
        : plural(rows.length, { one: '# question', other: '# questions' }),
      blocks,
    },
  };
}
