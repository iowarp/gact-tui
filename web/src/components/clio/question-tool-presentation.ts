import type { PendingInteraction, ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';

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
  return count ? `${count} ${count === 1 ? 'question' : 'questions'}` : undefined;
}

/** Present current and retained ask_user calls from their exact typed arguments. */
export function withQuestionPresentation(
  tool: ToolInvocation,
  interactions: readonly PendingInteraction[] = [],
): ToolInvocation {
  const rows = questions(tool);
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
        ? ['Yes', 'No']
        : [];
    return [
      {
        id: `question-prompt-${index}`,
        type: 'text',
        label: rows.length === 1 ? 'Question' : `Question ${index + 1}`,
        text:
          String(question.question) +
          (options.length
            ? `\n\nOptions:\n${options.map((option) => `• ${option}`).join('\n')}`
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
    blocks.push({ id: 'question-reason', type: 'text', label: 'Why I’m asking', text: reason });
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
  const interaction = interactions.find((row) => row.task_id === receipt?.handle);
  if (receipt?.kind === 'Question' && receipt.accepted === true) {
    const status = interaction?.status;
    blocks.push({
      id: 'question-state',
      type: 'text',
      label: 'Answer',
      text:
        status === 'pending'
          ? 'Waiting for your answer'
          : status === 'answered'
            ? 'Answered'
            : status === 'cancelled'
              ? 'Cancelled'
              : status === 'expired'
                ? 'Expired'
                : 'Answer requested at this step',
    });
  }
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      action: 'Ask you',
      subject: undefined,
      summary: `${rows.length} ${rows.length === 1 ? 'question' : 'questions'}`,
      blocks,
    },
  };
}
