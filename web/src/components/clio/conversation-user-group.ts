import type { Message } from '@clio/core/v3';
import { specialMessageExecutionMode } from './conversation-message-projection';

/** Share a sender heading only for adjacent human messages with the same context. */
export function canGroupUserMessages(
  previous: Message | undefined,
  current: Message | undefined,
): boolean {
  if (
    previous?.role !== 'user' ||
    current?.role !== 'user' ||
    previous.session_id !== current.session_id
  )
    return false;
  if (specialMessageExecutionMode(previous) !== specialMessageExecutionMode(current)) return false;
  const left = previous.metadata?.steer_delivery as
    | { assistant_message_id?: string; after_part_id?: string }
    | undefined;
  const right = current.metadata?.steer_delivery as
    | { assistant_message_id?: string; after_part_id?: string }
    | undefined;
  if (
    (left || right) &&
    (!left ||
      !right ||
      left.assistant_message_id !== right.assistant_message_id ||
      left.after_part_id !== right.after_part_id)
  )
    return false;
  return ![previous, current].some((message) =>
    ['ask_user_resume', 'plan_exit_resume', 'mcp_app_response'].some(
      (key) => message.metadata?.[key],
    ),
  );
}

/** Read a feedback segment without joining across intervening assistant activity. */
export function feedbackMessage(
  segment: { kind: string; message?: Message } | undefined,
): Message | undefined {
  return segment?.kind === 'feedback' ? segment.message : undefined;
}
