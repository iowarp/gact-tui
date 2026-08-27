import type {
  A2UISurface,
  ApprovalRequest,
  Artifact,
  EntityState,
  Message,
  MessageBlock,
  Run,
  Session,
  SubagentRun,
  Task,
  ToolInvocation,
  Workspace,
  UserQuestion,
} from './domain.js';
import {
  a2uiSurfaceSchema,
  approvalRequestSchema,
  artifactSchema,
  decodeEventEnvelope,
  messageBlockSchema,
  messageCompletionSchema,
  messageSchema,
  runSchema,
  sessionSchema,
  subagentSchema,
  taskSchema,
  toolInvocationSchema,
  workspaceSchema,
  userQuestionSchema,
} from './schemas.js';
import type { TransportFrame } from './transport.js';

const MAX_CURSOR_HISTORY = 2_048;

export function createEntityState(): EntityState {
  return {
    stream: 'offline',
    workspaces: {},
    sessions: {},
    runs: {},
    messages: {},
    tools: {},
    approvals: {},
    questions: {},
    tasks: {},
    subagents: {},
    artifacts: {},
    providers: {},
    usage: {},
    context: {},
    surfaces: {},
    revisions: {},
    processed_cursors: [],
  };
}

function revisionKey(type: string, entityId: string): string {
  return `${type}:${entityId}`;
}

function shouldApplyRevision(
  state: EntityState,
  type: string,
  entityId?: string,
  revision?: number,
): boolean {
  if (!entityId || revision === undefined) return true;
  return revision > (state.revisions[revisionKey(type, entityId)] ?? -1);
}

function recordRevision(
  state: EntityState,
  type: string,
  entityId?: string,
  revision?: number,
): Record<string, number> {
  if (!entityId || revision === undefined) return state.revisions;
  return { ...state.revisions, [revisionKey(type, entityId)]: revision };
}

function appendDelta(message: Message, blockId: string, delta: string): Message {
  const blocks = message.blocks.map((block): MessageBlock => {
    if (block.id !== blockId || (block.type !== 'text' && block.type !== 'reasoning')) return block;
    return { ...block, text: block.text + delta, streaming: true };
  });
  return { ...message, blocks };
}

function upsertBlock(message: Message, block: MessageBlock): Message {
  const index = message.blocks.findIndex((candidate) =>
    block.type === 'tool' && candidate.type === 'tool'
      ? candidate.tool_id === block.tool_id
      : candidate.id === block.id,
  );
  if (index < 0) return { ...message, blocks: [...message.blocks, block] };
  const blocks = [...message.blocks];
  blocks[index] = block;
  return { ...message, blocks };
}

function completeBlock(message: Message, blockId: string, text: string): Message {
  const blocks = message.blocks.map((block): MessageBlock => {
    if (block.id !== blockId || (block.type !== 'text' && block.type !== 'reasoning')) return block;
    return { ...block, text, streaming: false };
  });
  return { ...message, blocks };
}

export function reduceTransportFrame(state: EntityState, frame: TransportFrame): EntityState {
  const timelineCursor = frame.cursor !== '' && frame.cursor !== '0';
  if (timelineCursor && state.processed_cursors.includes(frame.cursor)) return state;
  const envelope = decodeEventEnvelope(frame.data);

  const cursors = timelineCursor
    ? [...state.processed_cursors, frame.cursor].slice(-MAX_CURSOR_HISTORY)
    : state.processed_cursors;
  const base: EntityState = {
    ...state,
    cursor: timelineCursor ? frame.cursor : state.cursor,
    processed_cursors: cursors,
  };
  if (!shouldApplyRevision(base, envelope.type, envelope.entity_id, envelope.entity_revision)) {
    return base;
  }

  const revisions = recordRevision(
    base,
    envelope.type,
    envelope.entity_id,
    envelope.entity_revision,
  );

  switch (envelope.type) {
    case 'workspace.upserted': {
      const workspace = workspaceSchema.parse(envelope.payload) as Workspace;
      return { ...base, revisions, workspaces: { ...base.workspaces, [workspace.id]: workspace } };
    }
    case 'message.upserted': {
      const message = messageSchema.parse(envelope.payload) as Message;
      return { ...base, revisions, messages: { ...base.messages, [message.id]: message } };
    }
    case 'session.upserted': {
      const session = sessionSchema.parse(envelope.payload) as Session;
      return { ...base, revisions, sessions: { ...base.sessions, [session.id]: session } };
    }
    case 'message.block.upserted': {
      const payload = envelope.payload as { message_id?: unknown; block?: unknown };
      if (typeof payload.message_id !== 'string') throw new Error('Invalid message block owner');
      const message = base.messages[payload.message_id];
      if (!message) return { ...base, revisions };
      const block = messageBlockSchema.parse(payload.block) as MessageBlock;
      return {
        ...base,
        revisions,
        messages: { ...base.messages, [message.id]: upsertBlock(message, block) },
      };
    }
    case 'message.block.delta': {
      const payload = envelope.payload as {
        message_id?: unknown;
        block_id?: unknown;
        delta?: unknown;
      };
      if (
        typeof payload.message_id !== 'string' ||
        typeof payload.block_id !== 'string' ||
        typeof payload.delta !== 'string'
      ) {
        throw new Error('Invalid message.block.delta payload');
      }
      const message = base.messages[payload.message_id];
      if (!message) return { ...base, revisions };
      return {
        ...base,
        revisions,
        messages: {
          ...base.messages,
          [message.id]: appendDelta(message, payload.block_id, payload.delta),
        },
      };
    }
    case 'message.block.completed': {
      const payload = envelope.payload as {
        message_id?: unknown;
        block_id?: unknown;
        text?: unknown;
      };
      if (
        typeof payload.message_id !== 'string' ||
        typeof payload.block_id !== 'string' ||
        typeof payload.text !== 'string'
      ) {
        throw new Error('Invalid message.block.completed payload');
      }
      const message = base.messages[payload.message_id];
      if (!message) return { ...base, revisions };
      return {
        ...base,
        revisions,
        messages: {
          ...base.messages,
          [message.id]: completeBlock(message, payload.block_id, payload.text),
        },
      };
    }
    case 'message.completed': {
      const payload = messageCompletionSchema.parse(envelope.payload);
      const message = base.messages[payload.message_id];
      if (!message) return { ...base, revisions };
      return {
        ...base,
        revisions,
        messages: {
          ...base.messages,
          [message.id]: {
            ...message,
            completed_at: payload.completed_at ?? envelope.occurred_at,
            usage: payload.tokens ?? message.usage,
            cost_usd: payload.cost_usd ?? message.cost_usd,
            stop_reason: payload.stop_reason ?? message.stop_reason,
            error_info: payload.error_info ?? message.error_info,
            blocks: message.blocks.map((block) =>
              block.type === 'text' || block.type === 'reasoning'
                ? { ...block, streaming: false }
                : block,
            ),
          },
        },
      };
    }
    case 'tool.upserted': {
      const candidate = toolInvocationSchema.parse(envelope.payload) as ToolInvocation;
      const previous = base.tools[candidate.id];
      const tool = previous ? { ...previous, ...candidate } : candidate;
      return { ...base, revisions, tools: { ...base.tools, [tool.id]: tool } };
    }
    case 'run.upserted': {
      const run = runSchema.parse(envelope.payload) as Run;
      return { ...base, revisions, runs: { ...base.runs, [run.id]: run } };
    }
    case 'approval.upserted': {
      const approval = approvalRequestSchema.parse(envelope.payload) as ApprovalRequest;
      return { ...base, revisions, approvals: { ...base.approvals, [approval.id]: approval } };
    }
    case 'approval.resolved': {
      const payload = envelope.payload as {
        id?: unknown;
        action?: unknown;
        status?: unknown;
        resolved_at?: unknown;
      };
      if (typeof payload.id !== 'string') throw new Error('Invalid resolved approval id');
      const approval = base.approvals[payload.id];
      if (!approval) return { ...base, revisions };
      const status =
        payload.status === 'approved' ||
        payload.status === 'denied' ||
        payload.status === 'cancelled'
          ? payload.status
          : approval.status;
      const action =
        payload.action === 'allow' ||
        payload.action === 'deny' ||
        payload.action === 'allow_session' ||
        payload.action === 'allow_workspace'
          ? payload.action
          : approval.action;
      return {
        ...base,
        revisions,
        approvals: {
          ...base.approvals,
          [approval.id]: {
            ...approval,
            status,
            action,
            resolved_at:
              typeof payload.resolved_at === 'string' ? payload.resolved_at : envelope.occurred_at,
          },
        },
      };
    }
    case 'question.upserted': {
      const question = userQuestionSchema.parse(envelope.payload) as UserQuestion;
      return { ...base, revisions, questions: { ...base.questions, [question.id]: question } };
    }
    case 'task.upserted': {
      const task = taskSchema.parse(envelope.payload) as Task;
      return { ...base, revisions, tasks: { ...base.tasks, [task.id]: task } };
    }
    case 'subagent.upserted': {
      const subagent = subagentSchema.parse(envelope.payload) as SubagentRun;
      return { ...base, revisions, subagents: { ...base.subagents, [subagent.id]: subagent } };
    }
    case 'artifact.upserted': {
      const artifact = artifactSchema.parse(envelope.payload) as Artifact;
      return { ...base, revisions, artifacts: { ...base.artifacts, [artifact.id]: artifact } };
    }
    case 'a2ui.surface.upserted': {
      const surface = a2uiSurfaceSchema.parse(envelope.payload) as A2UISurface;
      return { ...base, revisions, surfaces: { ...base.surfaces, [surface.id]: surface } };
    }
    case 'a2ui.surface.deleted': {
      const payload = envelope.payload as { surface_id?: unknown };
      if (typeof payload.surface_id !== 'string') throw new Error('Invalid deleted surface id');
      const surface = base.surfaces[payload.surface_id];
      if (!surface) return { ...base, revisions };
      return {
        ...base,
        revisions,
        surfaces: {
          ...base.surfaces,
          [payload.surface_id]: { ...surface, state: 'deleted' },
        },
      };
    }
    case 'stream.gap':
      return { ...base, revisions, stream: 'gapped' };
    case 'stream.live':
      return { ...base, revisions, stream: 'live' };
    default:
      return { ...base, revisions };
  }
}
