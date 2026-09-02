import type { TransportFrame } from '@clio/core/v3';

/**
 * The live events a person has to be told about, because refreshing a query
 * would not show them anything.
 *
 * Most stream events change a list the surface re-reads, so the refresh IS the
 * feedback. A few report that something the person asked for did not happen:
 * refreshing the queue after a promotion failed shows the message still sitting
 * there, which reads as "nothing happened" rather than "the send was refused".
 * Those get a notice with a stable identity, so a replayed frame after a
 * reconnect collapses onto the notice already shown instead of stacking.
 */
export interface StreamNotice {
  /** Stable machine-readable reason, and the notice's identity prefix. */
  code: 'queued_message.promotion_failed';
  /** Identity for the notice, so a redelivered frame does not raise a second. */
  id: string;
  title: string;
  description: string;
}

function entityId(frame: TransportFrame): string {
  const envelope = frame.data as { entity_id?: unknown };
  return typeof envelope.entity_id === 'string' && envelope.entity_id !== ''
    ? envelope.entity_id
    : frame.cursor;
}

function recoverable(frame: TransportFrame): boolean {
  const envelope = frame.data as { payload?: { recoverable?: unknown } };
  return envelope.payload?.recoverable !== false;
}

/** The notice one live frame owes the person, if it owes one at all. */
export function streamNoticeForFrame(frame: TransportFrame): StreamNotice | undefined {
  if (frame.eventName !== 'queued_message.promotion_failed') return undefined;
  return {
    code: 'queued_message.promotion_failed',
    id: `queued_message.promotion_failed:${entityId(frame)}`,
    title: 'A queued message could not be sent',
    description: recoverable(frame)
      ? 'It is still in the queue. Send it again once the current turn settles.'
      : 'It is still in the queue, and the service will not retry it on its own.',
  };
}
