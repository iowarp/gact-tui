import type { Session } from './domain.js';

export interface SessionUpdateInput {
  title?: string;
  pinned?: boolean;
  message_marks?: Record<string, boolean>;
  archived?: boolean;
  mode?: Session['mode'];
  edit_mode?: Session['edit_mode'];
  routing_mode?: Session['routing_mode'];
  approval_mode?: Session['approval_mode'];
  provider_id?: string;
  model_id?: string;
  /**
   * The fleet model (`<account>/<model>`) SPOTTER review runs on; empty uses
   * the conversation's model.
   */
  spotter_model?: string;
}

/** User session metadata uses per-message deltas, rather than replacing all marks. */
export function sessionMetadataPatch(input: SessionUpdateInput) {
  if (
    input.pinned === undefined &&
    input.message_marks === undefined &&
    input.spotter_model === undefined
  )
    return {};
  return {
    metadata: {
      ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
      ...(input.message_marks === undefined ? {} : { message_marks: input.message_marks }),
      ...(input.spotter_model === undefined ? {} : { spotter_model: input.spotter_model }),
    },
  };
}
