import type { Message } from '@clio/core/v3';
import { t } from '@lingui/core/macro';
import { humanFailureText } from './composer-failure';
import { humanizeProtocolValue } from './presentation-labels';

/**
 * Typed reasons for a reply that failed because the conversation's saved context
 * (the record of what the agent has seen) could not be read back. Retrying cannot
 * fix them; going back to before the damage, or continuing in a copy, can.
 */
const STORED_CONTEXT_FAILURES = new Set(['context_fold_failed', 'arc_context_read_failed']);

function details(errorInfo: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = errorInfo?.details;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/**
 * The failure's own code: `details.reason` when the service typed it, else `error`.
 * Replies recorded before the service carried the reason keep the fold failure's own
 * record (`problem` and `segment_id`), which names it as well.
 */
export function replyFailureCode(errorInfo: Record<string, unknown> | undefined): string {
  const record = details(errorInfo);
  if (typeof record.reason === 'string' && record.reason) return record.reason;
  if (typeof record.problem === 'string' && typeof record.segment_id === 'string')
    return 'context_fold_failed';
  return typeof errorInfo?.error === 'string' ? errorInfo.error : '';
}

/** Identifiers a sentence for people does not contain (`unanswered_call`, a record id). */
const IDENTIFIER = /\b[a-z]+_[a-z\d_]+\b|\b[\da-f]{8}-[\da-f]{4}-/u;

/** True when the reply failed on the conversation's saved context. */
export function storedContextFailed(errorInfo: Record<string, unknown> | undefined): boolean {
  return STORED_CONTEXT_FAILURES.has(replyFailureCode(errorInfo));
}

/**
 * Why a reply failed, as one sentence for people. A typed code CLIO knows gets fixed
 * wording; otherwise the service's own sentence when it reads as one, else the code.
 */
export function replyFailureReason(code: string, message: string | undefined): string | undefined {
  if (code === 'context_fold_failed')
    return t`Part of this conversation’s saved history can’t be read back, so the agent can’t continue from it.`;
  if (code === 'arc_context_read_failed')
    return t`This conversation’s saved history couldn’t be read.`;
  if (code === 'arc_context_write_failed')
    return t`This conversation’s progress couldn’t be saved.`;
  const sentence = message && !IDENTIFIER.test(message) ? humanFailureText(message) : undefined;
  if (sentence) return sentence;
  if (code && code !== 'agent_error') return humanizeProtocolValue(code);
  return message ? t`The service hit an error.` : undefined;
}

/** Where a failed reply's conversation can be taken back to, or copied from. */
export interface ReplyRecoveryPoint {
  /** The last reply before the damaged part: rewinding there removes it. */
  rewindTo?: string;
  /** The last reply that loaded: a copy through it starts from the readable transcript. */
  copyFrom?: string;
}

/**
 * For each reply that failed on the saved context, the replies to recover from. The
 * service names the turn that recorded the unreadable part (`details.turn_id`); the
 * rewind point is the last good reply before that turn's first message.
 */
export function replyRecoveryPoints(
  messages: readonly Message[],
): ReadonlyMap<string, ReplyRecoveryPoint> {
  const points = new Map<string, ReplyRecoveryPoint>();
  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || !storedContextFailed(message.error_info)) return;
    // A conversation that answered again since has nothing left to recover.
    if (messages.slice(index + 1).some((row) => row.role === 'assistant' && !row.error_info))
      return;
    const earlier = messages.slice(0, index);
    const damaged = details(message.error_info).turn_id;
    const firstDamaged =
      typeof damaged === 'string' && damaged
        ? earlier.findIndex((row) => (row.turn_id ?? row.id) === damaged)
        : -1;
    const good = (rows: readonly Message[]) =>
      rows.findLast((row) => row.role === 'assistant' && !row.error_info)?.id;
    const point = {
      rewindTo: good(firstDamaged >= 0 ? earlier.slice(0, firstDamaged) : earlier),
      copyFrom: good(earlier),
    };
    if (point.rewindTo || point.copyFrom) points.set(message.id, point);
  });
  return points;
}
