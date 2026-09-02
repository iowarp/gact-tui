import {
  eventEnvelopeSchema,
  reduceTransportFrame,
  type EntityState,
  type TransportFrame,
  type TransportGap,
} from '@clio/core/v3';

export interface ContainedReduction {
  entities: EntityState;
  gaps: TransportGap[];
}

/**
 * Applies transport frames one at a time so a single unreadable frame cannot
 * discard the rest of its batch. Every frame the reducer refuses is recorded as
 * a typed gap instead of throwing into the caller's render.
 */
export function reduceFramesContained(
  entities: EntityState,
  frames: readonly TransportFrame[],
): ContainedReduction {
  let next = entities;
  const gaps: TransportGap[] = [];

  for (const frame of frames) {
    const decoded = eventEnvelopeSchema.safeParse(frame.data);
    if (!decoded.success) {
      gaps.push({
        cursor: frame.cursor,
        event_name: frame.eventName,
        code: 'frame_decode_failed',
        reason: decoded.error.issues[0]?.message ?? 'Unable to decode live frame',
        received_at: frame.receivedAt,
      });
      continue;
    }

    if (decoded.data.type !== frame.eventName) {
      gaps.push({
        cursor: frame.cursor,
        event_name: frame.eventName,
        entity_id: decoded.data.entity_id,
        code: 'event_name_mismatch',
        reason: `Stream named ${frame.eventName}; envelope named ${decoded.data.type}`,
        received_at: frame.receivedAt,
      });
    }

    try {
      next = reduceTransportFrame(next, frame);
    } catch (error) {
      gaps.push({
        cursor: frame.cursor,
        event_name: decoded.data.type,
        entity_id: decoded.data.entity_id,
        code: 'frame_decode_failed',
        reason: error instanceof Error ? error.message : 'Unable to decode live frame payload',
        received_at: frame.receivedAt,
      });
    }
  }

  return { entities: next, gaps };
}
