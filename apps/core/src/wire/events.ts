import type { Message, Part, PermissionRequest, SessionStatus } from './types.js';

export interface EventEnvelope<T> {
  type: string;
  occurred_at: string;
  data: T;
}

export interface SessionStatusEvent {
  session_id: string;
  status: SessionStatus;
}

export interface MessageCreatedEvent {
  session_id: string;
  message: Message;
}

export interface MessagePartAddedEvent {
  session_id: string;
  message_id: string;
  part: Part;
}

export interface MessagePartDeltaEvent {
  session_id: string;
  message_id: string;
  part_index: number;
  text_append?: string;
}

export interface MessageCompletedEvent {
  session_id: string;
  message_id: string;
}

export interface PermissionRequestedEvent {
  session_id: string;
  permission: PermissionRequest;
}

export interface UsageEvent {
  session_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export type GactEvent =
  | EventEnvelope<SessionStatusEvent> & { type: 'session.status' }
  | (EventEnvelope<MessageCreatedEvent> & { type: 'message.created' })
  | (EventEnvelope<MessagePartAddedEvent> & { type: 'message.part.added' })
  | (EventEnvelope<MessagePartDeltaEvent> & { type: 'message.part.delta' })
  | (EventEnvelope<MessageCompletedEvent> & { type: 'message.completed' })
  | (EventEnvelope<PermissionRequestedEvent> & { type: 'permission.requested' })
  | (EventEnvelope<UsageEvent> & { type: 'usage' });
