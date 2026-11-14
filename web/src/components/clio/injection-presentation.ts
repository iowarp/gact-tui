import type { PendingInteraction, ToolPresentationBlock } from '@clio/core/v3';
import { humanizeProtocolValue } from './presentation-labels';
import { questionAnswerPresentation } from './question-answer-presentation';
import { t, ph, plural } from '@lingui/core/macro';

export interface InjectionPresentation {
  label: string;
  terminal?: ToolPresentationBlock;
  text?: string;
  format?: 'markdown' | 'json' | 'text';
  notice?: string;
  attribution?: string;
  senderSessionId?: string;
  /** Background scripts the message came from, each shown in Work by its handle. */
  tasks?: { handle: string; label: string }[];
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
  const plan = planDecision(text);
  if (plan) return plan;
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
      label: t`Received message from an agent`,
      senderSessionId: /^\[Agent session ([^;\]\n]+);/u.exec(text)?.[1],
      text: body.text,
      format: 'markdown',
    };

  if (source === 'attention' && body?.type === 'clio.code.notify' && Array.isArray(body.tasks))
    return backgroundNotices(body.tasks);

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
        text: [
          stdout,
          stderr &&
            t`Standard error:
${stderr}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        exit_code: typeof shell.exit_code === 'number' ? shell.exit_code : undefined,
        timed_out: shell.timed_out === true,
      },
      notice:
        shell.stdout_truncated || shell.stderr_truncated
          ? t`Output was truncated. Exact details retain any saved-output references.`
          : undefined,
    };
  }
  if (output === null || output === undefined)
    output = body?.error ?? t`No result body was recorded.`;
  return typeof output === 'string'
    ? { label, text: output, format: 'markdown' }
    : { label, text: JSON.stringify(output, null, 2), format: 'json' };
}

/** A background script's notifies, grouped by script; their data stays in the exact text. */
function backgroundNotices(tasks: unknown[]): InjectionPresentation {
  const scripts = tasks.flatMap((item) => {
    const task = record(item);
    return task ? [task] : [];
  });
  const name = (task: Record<string, unknown>) =>
    typeof task.label === 'string' && task.label.trim() ? task.label.trim() : 'a background script';
  const lines = scripts.flatMap((task) => {
    const notifies = (Array.isArray(task.notifies) ? task.notifies : []).flatMap((item) => {
      const notify = record(item);
      return notify && typeof notify.message === 'string' && notify.message.trim()
        ? [`- ${notify.message.trim()}`]
        : [];
    });
    return scripts.length > 1 ? [`**${name(task)}**`, ...notifies, ''] : notifies;
  });
  return {
    label:
      scripts.length === 1
        ? t`Message from ${ph({ script: name(scripts[0]) })}`
        : plural(scripts.length, {
            one: 'Messages from # background script',
            other: 'Messages from # background scripts',
          }),
    text: lines.join('\n').trim() || t`The script sent no text.`,
    format: 'markdown',
    tasks: scripts.flatMap((task) =>
      typeof task.handle === 'string' && task.handle
        ? [{ handle: task.handle, label: name(task) }]
        : [],
    ),
  };
}

/**
 * The context the agent receives after a plan decision: a constraint-lifting header,
 * JSON metadata and the approved plan, or the reviewer's feedback. People read the
 * decision and the plan; the exact text stays in ⓘ.
 */
function planDecision(envelope: string): InjectionPresentation | null {
  // Recorded decisions arrive as `[CLIO; approval; …]` + {text, metadata}; older
  // records carry the resume text alone.
  let text = envelope;
  let meta: Record<string, unknown> | undefined;
  const boundary = envelope.indexOf('\n');
  if (/^\[CLIO; approval; /u.test(envelope) && boundary > 0) {
    try {
      const body = record(JSON.parse(envelope.slice(boundary + 1)));
      if (typeof body?.text === 'string') {
        text = body.text;
        meta = record(body.metadata) ?? undefined;
      }
    } catch {
      return null;
    }
  }
  const result = meta?.plan_exit_result;
  const approved =
    /^\[STATE TRANSITION OVERRIDE\][^\n]*(?:\n\nApproved plan context: [^\n]*)?\n<approved-plan>\n([\s\S]*?)<\/approved-plan>\s*$/u.exec(
      text,
    );
  const savedPlan = record(meta?.approved_plan)?.content;
  if (approved || result === 'approved')
    return {
      label: t`Plan approved`,
      attribution:
        /prompted to approve each action/u.test(text) || meta?.plan_exit_mode === 'interactive'
          ? t`You approved the plan. The agent may now change files, asking before each action.`
          : t`You approved the plan. The agent may now change files to carry it out.`,
      text:
        approved?.[1]?.trim() ||
        (typeof savedPlan === 'string' && savedPlan.trim()) ||
        t`No plan text was recorded.`,
      format: 'markdown',
    };
  const rejected =
    /^Your request to exit plan mode was REJECTED[^\n]*\n\nReviewer feedback: ([\s\S]*)$/u.exec(
      text,
    );
  if (!rejected && result === 'rejected')
    return {
      label: t`Plan sent back`,
      attribution: t`You asked for changes. The agent stays in plan mode and revises the plan.`,
      text: t`No reviewer feedback was recorded.`,
      format: 'text',
    };
  if (rejected)
    return {
      label: t`Plan sent back`,
      attribution: t`You asked for changes. The agent stays in plan mode and revises the plan.`,
      text: rejected[1]!.trim(),
      format: 'text',
    };
  return null;
}

/**
 * "Loaded 3 tools from hdf5" for a server the person summoned. The text is what
 * `search_tools` returns, one `## <tool>  (<server>)` heading per loaded tool.
 */
export function summonServerLabel(block: { source: string; text: string }): string | undefined {
  if (block.source !== 'summon_server') return undefined;
  const server = /pointed this message at the (\S+) tools/u.exec(block.text)?.[1];
  if (!server) return undefined;
  const count = [...block.text.matchAll(/^## \S+ {2}\(([^)]+)\)$/gmu)].filter(
    (match) => match[1] === server,
  ).length;
  return count
    ? plural(count, { one: `Loaded # tool from ${server}`, other: `Loaded # tools from ${server}` })
    : t`You pointed this message at the ${server} tools`;
}
