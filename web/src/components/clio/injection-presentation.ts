import type { PendingInteraction, ToolPresentationBlock } from '@clio/core/v3';
import { humanizeProtocolValue } from './presentation-labels';
import { questionAnswerPresentation } from './question-answer-presentation';

export interface InjectionPresentation {
  label: string;
  terminal?: ToolPresentationBlock;
  text?: string;
  format?: 'markdown' | 'json' | 'text';
  notice?: string;
  attribution?: string;
  senderSessionId?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Project a recorded mailbox envelope for readers without changing its evidence. */
export function injectionPresentation(
  source: string,
  text: string,
  interactions: readonly PendingInteraction[] = [],
): InjectionPresentation | null {
  const header = /^\[(?:CLIO|Agent session [^;\]\n]+); ([a-z_]+); /u.exec(text);
  if (header?.[1] !== source) return null;
  const boundary = text.indexOf('\n');
  if (boundary < 0) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(text.slice(boundary + 1));
  } catch {
    return null;
  }
  const body = record(payload);
  if (source === 'peer' && typeof body?.text === 'string')
    return {
      label: 'Received message from an agent',
      senderSessionId: /^\[Agent session ([^;\]\n]+);/u.exec(text)?.[1],
      text: body.text,
      format: 'markdown',
    };

  const task = /^\[CLIO; [a-z_]+; ([A-Za-z]+) [^\s:]+: ([a-z_]+)/u.exec(text);
  if (!task) return null;
  const label = `${humanizeProtocolValue(task[1])} ${humanizeProtocolValue(task[2]).toLowerCase()}`;
  // Native tasks wrap the tool result. Its structured content is canonical;
  // content[] is the alternate MCP representation, not another copy to display.
  const result = body && 'result_type' in body ? body.result : payload;
  const envelope = record(result);
  let output: unknown = envelope?.structuredContent ?? result;
  if (output === result && Array.isArray(envelope?.content)) {
    const texts = envelope.content.flatMap((item: unknown) => {
      const block = record(item);
      return block?.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
    });
    if (texts.length) {
      output = texts.join('\n\n');
      try {
        output = JSON.parse(output as string);
      } catch {
        // Ordinary MCP text is already usable prose, not malformed JSON.
      }
    }
  }
  const shell = record(output);
  if (source === 'question_answer' && task[1] === 'Question' && shell) {
    const handle = /; Question ([^\s:]+):/u.exec(text)?.[1];
    const interaction = interactions.find((row) => row.task_id === handle);
    return {
      ...questionAnswerPresentation(shell, interaction),
      format: 'text',
    };
  }
  if (task[1] === 'Shell' && typeof shell?.command === 'string') {
    const stdout = typeof shell.stdout === 'string' ? shell.stdout : '';
    const stderr = typeof shell.stderr === 'string' ? shell.stderr : '';
    return {
      label,
      terminal: {
        id: 'notification-output',
        type: 'terminal',
        command: shell.command,
        text: [stdout, stderr && `Standard error:\n${stderr}`].filter(Boolean).join('\n\n'),
        exit_code: typeof shell.exit_code === 'number' ? shell.exit_code : undefined,
        timed_out: shell.timed_out === true,
      },
      notice:
        shell.stdout_truncated || shell.stderr_truncated
          ? 'Output was truncated. Exact details retain any saved-output references.'
          : undefined,
    };
  }
  if (output === null || output === undefined)
    output = body?.error ?? 'No result body was recorded.';
  return typeof output === 'string'
    ? { label, text: output, format: 'markdown' }
    : { label, text: JSON.stringify(output, null, 2), format: 'json' };
}
