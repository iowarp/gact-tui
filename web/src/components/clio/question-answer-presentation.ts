import type { PendingInteraction } from '@clio/core/v3';
import { bundleQuestions } from './question-bundle';
import { humanizeProtocolValue } from './presentation-labels';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function replyText(reply: Record<string, unknown>, options: unknown): string {
  const offered = Array.isArray(options) ? options.map(record) : [];
  const selected = Array.isArray(reply.selected_options)
    ? reply.selected_options.filter((value): value is string => typeof value === 'string')
    : [];
  const choices = selected.map((value) => {
    const option = offered.find((row) => row && (row.value ?? row.label) === value);
    return typeof option?.label === 'string' ? option.label : value;
  });
  return [
    reply.action === 'decline' ? 'You declined to answer.' : '',
    choices.length ? `Selected: ${choices.join(', ')}` : '',
    typeof reply.answer === 'string' ? reply.answer : '',
    ...(Array.isArray(reply.parts)
      ? reply.parts.flatMap((raw) => {
          const part = record(raw);
          if (!part) return [];
          if (part.type === 'text' && typeof part.text === 'string') return [part.text];
          const resource = record(part.resource);
          const name = part.name ?? part.filename ?? resource?.name;
          const media = part.media_type ?? part.mime_type ?? resource?.mimeType;
          const label =
            typeof name === 'string'
              ? name
              : humanizeProtocolValue(String(part.type ?? 'Attachment'));
          return [`Attachment: ${label}${typeof media === 'string' ? ` (${media})` : ''}`];
        })
      : []),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Pair canonical human replies with their authorized question definitions when retained. */
export function questionAnswerPresentation(
  reply: Record<string, unknown>,
  interaction?: PendingInteraction,
): { label: string; text: string } {
  const answers = record(record(reply.metadata)?.answers);
  const bundle = interaction ? bundleQuestions(interaction) : [];
  const paired =
    bundle.length && answers && bundle.every((question) => record(answers[question.id]));
  const text = paired
    ? [
        interaction?.prompt || interaction?.title,
        ...bundle.map(
          (question, index) =>
            `${index + 1}. ${question.question}\n${replyText(record(answers![question.id])!, question.options)}`,
        ),
        replyText({ parts: reply.parts }, []),
      ]
        .filter(Boolean)
        .join('\n\n')
    : [interaction?.prompt || interaction?.title, replyText(reply, interaction?.payload?.options)]
        .filter(Boolean)
        .join('\n\n');
  return {
    label: answers ? 'Your answers' : 'Your answer',
    text: text || 'No answer text was recorded.',
  };
}
