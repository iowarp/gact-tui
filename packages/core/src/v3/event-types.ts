/** Canonical GACT 0.3 state-bearing event vocabulary. */
export const GACT_V3_EVENT_TYPES = [
  'a2ui.surface.deleted',
  'a2ui.surface.upserted',
  'approval.resolved',
  'approval.upserted',
  'artifact.upserted',
  'message.block.completed',
  'message.block.delta',
  'message.block.upserted',
  'message.completed',
  'message.upserted',
  'question.upserted',
  'run.upserted',
  'session.upserted',
  'stream.gap',
  'stream.live',
  'subagent.upserted',
  'task.upserted',
  'tool.upserted',
  'workspace.upserted',
] as const;

export type GactV3EventType = (typeof GACT_V3_EVENT_TYPES)[number];
