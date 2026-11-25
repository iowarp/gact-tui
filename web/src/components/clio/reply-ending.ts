import type { Message } from '@clio/core/v3';
import { t } from '@lingui/core/macro';
import { replyFailureCode, replyFailureReason } from './reply-failure';

function errorDetail(message: Message, key: string): unknown {
  const details = message.error_info?.details;
  return typeof details === 'object' && details !== null
    ? (details as Record<string, unknown>)[key]
    : undefined;
}

/** The person cancelled this reply themselves; the service stopping is not that. */
export function replyCancelledByPerson(message: Message): boolean {
  const info = message.error_info;
  // The service stopping cancels a turn too (`reason: server_shutdown`); that is an
  // interruption the person did not ask for, so it is said, not shown as their cancel.
  if (errorDetail(message, 'reason') === 'server_shutdown') return false;
  return (
    info?.error === 'cancelled' ||
    (typeof info?.message === 'string' &&
      info.message.trim().toLowerCase() === 'turn cancelled by client')
  );
}

/** The reply's row shows a notice of how it ended: an error part or the service's reason. */
export function replyStatesItsEnd(message: Message): boolean {
  const reason = message.error_info?.message;
  return (
    message.blocks.some((block) => block.type === 'error') ||
    (typeof reason === 'string' && reason.length > 0 && !replyCancelledByPerson(message))
  );
}

export interface ReplyEnding {
  errorCode?: string;
  errorMessage?: string;
  cancelledByPerson: boolean;
  interruptedByService: boolean;
  /** Why it did not finish, in product copy; undefined when nothing is known. */
  failureReason?: string;
  retryable: boolean;
}

/**
 * How an assistant reply ended, as its row says it. `resumedBy` is the later reply
 * that continued it after a restart, when one exists.
 */
export function replyEnding(message: Message, resumedBy?: string): ReplyEnding {
  const errorCode =
    typeof message.error_info?.error === 'string' ? message.error_info.error : undefined;
  const errorMessage =
    typeof message.error_info?.message === 'string' ? message.error_info.message : undefined;
  const stoppedByService =
    errorCode === 'cancelled' && errorDetail(message, 'reason') === 'server_shutdown';
  const restartInterrupted = errorCode === 'server_restart_interrupted';
  // The restart's recovery continues this turn by itself (`details.resuming`), so the
  // row says so and offers no Retry, which would ask for the same work again (CC-O1).
  const resuming = restartInterrupted && errorDetail(message, 'resuming') === true;
  const interruptedByService = stoppedByService || restartInterrupted;
  const cancelledByPerson = replyCancelledByPerson(message);
  // An interruption by the service says so; any other failure says why it failed.
  const failureReason = stoppedByService
    ? t`The agent service stopped before this reply finished. Your request was kept.`
    : restartInterrupted
      ? resumedBy
        ? t`The agent service restarted before this reply finished. It continued below.`
        : resuming
          ? t`The agent service restarted before this reply finished. It is continuing on its own.`
          : t`The agent service restarted before this reply finished. Your request was kept, so you can retry it.`
      : replyFailureReason(replyFailureCode(message.error_info), errorMessage);
  // A reply the service failed as recoverable (a timed-out model call: error_info
  // recoverable, recovery "retry") can be retried even when it streamed something
  // first; only the person's own cancellation is not offered again, and a reply the
  // restart resumes or already resumed is not retried, which would ask again (CC-O1).
  const retryable =
    message.role === 'assistant' &&
    !resumedBy &&
    !resuming &&
    (message.blocks.length === 0 ||
      message.blocks.some((block) => block.type === 'error' && block.recoverable) ||
      (message.error_info?.recoverable === true && !cancelledByPerson));
  return {
    errorCode,
    errorMessage,
    cancelledByPerson,
    interruptedByService,
    failureReason,
    retryable,
  };
}
