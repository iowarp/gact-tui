import { decodeEventEnvelope, taskUpdateSchema, type TransportFrame } from '@clio/core/v3';

/** A task notice is a refresh hint; content still comes from an authorized REST read. */
export function taskUpdateForFrame(frame: TransportFrame) {
  if (frame.eventName !== 'task.updated') return undefined;
  try {
    const result = taskUpdateSchema.safeParse(decodeEventEnvelope(frame.data).payload);
    return result.success ? result.data : undefined;
  } catch {
    // Frame reduction owns malformed-envelope gap reporting, including this event.
    return undefined;
  }
}
