import type { Artifact, Message, RunState, SubagentRun } from '@clio/core/v3';
import type { ComponentProps } from 'react';
import { useMemo, useRef } from 'react';
import { useLiveStore } from '@/store/live-store';
import { useTaskCancellation } from '@/hooks/use-task-cancellation';
import { useSubagentControl } from '@/hooks/use-subagent-control';
import { useMessageMarks } from '@/hooks/use-message-marks';
import { useEarlierMessages } from '@/hooks/use-earlier-messages';
import { useShallowStableRecord } from '@/hooks/use-shallow-stable-record';
import { conversationForkOrigin } from './conversation-fork-origin';
import { ClioConversation, type ClioConversationProps } from './conversation';
import { ClioObservabilityDock, ClioObservabilityView } from './observability-dock';
import { WorkspaceStatusStrip } from './workspace-route-surfaces';
import {
  countActiveWork,
  countWorkNeedingInspection,
  unansweredMessageIds,
} from './workspace-route-state';

type MessageBlockOf<T extends Message['blocks'][number]['type']> = Extract<
  Message['blocks'][number],
  { type: T }
>;

/**
 * What the Activity dock and view read of a message: its order, its turn, and
 * which tools, delegations, citations, resources and summaries it carries.
 * Streamed text and reasoning are left out, so a token delta doesn't change it.
 */
function blockShape(block: Message['blocks'][number]): string {
  const base = `${block.type}:${'id' in block ? block.id : ''}:${block.sequence ?? ''}`;
  switch (block.type) {
    case 'tool':
      return `${base}:${(block as MessageBlockOf<'tool'>).tool_id}`;
    case 'subagent': {
      const subagent = block as MessageBlockOf<'subagent'>;
      return `${base}:${subagent.subagent_id}:${subagent.stage}`;
    }
    case 'citation': {
      const citation = block as MessageBlockOf<'citation'>;
      return `${base}:${citation.label}:${citation.uri}`;
    }
    case 'resource': {
      const resource = block as MessageBlockOf<'resource'>;
      return `${base}:${resource.workspace_id}:${resource.resource_id}:${resource.resource_revision}:${resource.name}:${resource.media_type}`;
    }
    case 'injection': {
      const injection = block as MessageBlockOf<'injection'>;
      return `${base}:${injection.source}:${injection.text.length}`;
    }
    default:
      return base;
  }
}

const messageShapes = new WeakMap<Message, string>();
function messageShape(message: Message): string {
  let shape = messageShapes.get(message);
  if (shape === undefined) {
    shape = [message.id, message.role, message.created_at, ...message.blocks.map(blockShape)].join(
      '\u0001',
    );
    messageShapes.set(message, shape);
  }
  return shape;
}

/**
 * The session's messages for the Activity dock and view. The list keeps its
 * identity while only streamed text changes, so the dock isn't re-rendered on
 * every token. Its text may lag the transcript; read text from the transcript.
 */
function useSessionMessageStructure(sessionId: string): Message[] {
  const cache = useRef<{
    entities?: Record<string, Message>;
    sessionId?: string;
    shape?: string;
    list: Message[];
  }>({ list: [] });
  return useLiveStore((state) => {
    const entities = state.entities.messages;
    const current = cache.current;
    if (current.entities === entities && current.sessionId === sessionId) return current.list;
    const list = Object.values(entities)
      .filter((message): message is Message => message.session_id === sessionId)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    const shape = list.map(messageShape).join('\u0002');
    cache.current = {
      entities,
      sessionId,
      shape,
      list: current.sessionId === sessionId && current.shape === shape ? current.list : list,
    };
    return cache.current.list;
  });
}

type LiveConversationProps = Omit<
  ClioConversationProps,
  | 'actionLifecycles'
  | 'artifacts'
  | 'compactions'
  | 'messages'
  | 'subagents'
  | 'surfaces'
  | 'tasks'
  | 'tools'
> & {
  artifacts: readonly Artifact[];
  sessionId: string;
  subagents: readonly SubagentRun[];
  sessionState?: RunState;
  /** The newest page left older messages unread (the transcript is paged). */
  hasEarlierMessages?: boolean;
};

/** Isolates high-rate message updates from the surrounding workspace chrome. */
export function WorkspaceLiveConversation({
  artifacts: artifactList,
  sessionId,
  subagents: subagentList,
  sessionState,
  hasEarlierMessages = false,
  ...props
}: LiveConversationProps) {
  const session = useLiveStore((state) => state.entities.sessions[sessionId]);
  const messageMarks = useMessageMarks(session);
  const forkOrigin = useMemo(() => conversationForkOrigin(session), [session]);
  const infrastructure = useLiveStore((state) => state.entities.infrastructure);
  const activeTurnId = useLiveStore((state) => state.entities.active_turns[sessionId]);
  const activeTurnResponded = useLiveStore((state) =>
    Boolean(activeTurnId && state.entities.responded_turns[sessionId] === activeTurnId),
  );
  const dependencies = useMemo(
    () => Object.values(infrastructure).filter((item) => item.session_id === sessionId),
    [infrastructure, sessionId],
  );
  const messageEntities = useLiveStore((state) => state.entities.messages);
  const artifactEntities = useLiveStore((state) => state.entities.artifacts);
  const subagentEntities = useLiveStore((state) => state.entities.subagents);
  const surfaceEntities = useLiveStore((state) => state.entities.surfaces);
  const actionLifecycles = useLiveStore((state) => state.entities.a2ui_action_lifecycles);
  const compactionEntities = useLiveStore((state) => state.entities.compactions);
  const tasks = useLiveStore((state) => state.entities.tasks);
  const tools = useLiveStore((state) => state.entities.tools);
  const messages = useMemo(
    () =>
      Object.values(messageEntities)
        .filter((message): message is Message => message.session_id === sessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [messageEntities, sessionId],
  );
  const artifacts = useShallowStableRecord(
    useMemo(
      () =>
        Object.fromEntries(
          [
            ...Object.values(artifactEntities).filter(
              (artifact) => artifact.session_id === sessionId,
            ),
            ...artifactList,
          ].map((artifact) => [artifact.id, artifact]),
        ),
      [artifactEntities, artifactList, sessionId],
    ),
  );
  const surfaces = useMemo(
    () =>
      Object.fromEntries(
        Object.values(surfaceEntities)
          .filter((surface) => surface.session_id === sessionId)
          .map((surface) => [surface.id, surface]),
      ),
    [sessionId, surfaceEntities],
  );
  const compactions = useMemo(
    () =>
      Object.values(compactionEntities).filter((compaction) => compaction.session_id === sessionId),
    [compactionEntities, sessionId],
  );
  const subagents = useShallowStableRecord(
    useMemo(
      () => ({
        ...subagentEntities,
        ...Object.fromEntries(subagentList.map((subagent) => [subagent.id, subagent])),
      }),
      [subagentEntities, subagentList],
    ),
  );
  const earlier = useEarlierMessages(sessionId, hasEarlierMessages, messages[0]?.id);
  const { pendingMessageIds: listedPending, cancellablePendingMessageIds: listedCancellable } =
    props;
  const running = sessionState === 'running';
  const pendingMessageIds = useMemo(
    () => unansweredMessageIds(listedPending, messages, running),
    [listedPending, messages, running],
  );
  const cancellablePendingMessageIds = useMemo(
    () => unansweredMessageIds(listedCancellable, messages, running),
    [listedCancellable, messages, running],
  );
  const entities = useMemo(
    () => ({ actionLifecycles, artifacts, compactions, subagents, surfaces, tasks, tools }),
    [actionLifecycles, artifacts, compactions, subagents, surfaces, tasks, tools],
  );
  return (
    <ClioConversation
      {...entities}
      {...props}
      {...messageMarks}
      sessionId={sessionId}
      earlier={earlier}
      forkOrigin={forkOrigin}
      messages={messages}
      pendingMessageIds={pendingMessageIds}
      cancellablePendingMessageIds={cancellablePendingMessageIds}
      preparation={{ activeTurnId, activeTurnResponded, dependencies, sessionState }}
    />
  );
}

type LiveObservabilityDockProps = Omit<ComponentProps<typeof ClioObservabilityDock>, 'messages'> & {
  sessionId: string;
};

export function WorkspaceLiveObservabilityDock({
  sessionId,
  ...props
}: LiveObservabilityDockProps) {
  const onCancelTask = useTaskCancellation(sessionId);
  const onControlTask = useSubagentControl(sessionId);
  const usage = useLiveStore((state) => state.entities.usage[sessionId]);
  return (
    <ClioObservabilityDock
      {...props}
      sessionId={sessionId}
      usage={usage}
      onCancelTask={onCancelTask}
      onControlTask={onControlTask}
      messages={useSessionMessageStructure(sessionId)}
    />
  );
}

type LiveObservabilityViewProps = Omit<ComponentProps<typeof ClioObservabilityView>, 'messages'> & {
  sessionId: string;
};

export function WorkspaceLiveObservabilityView({
  sessionId,
  ...props
}: LiveObservabilityViewProps) {
  const onCancelTask = useTaskCancellation(sessionId);
  const onControlTask = useSubagentControl(sessionId);
  return (
    <ClioObservabilityView
      {...props}
      onCancelTask={onCancelTask}
      onControlTask={onControlTask}
      messages={useSessionMessageStructure(sessionId)}
      sessionId={sessionId}
    />
  );
}

type LiveStatusStripProps = Omit<
  ComponentProps<typeof WorkspaceStatusStrip>,
  'cursor' | 'stream' | 'activeWorkCount' | 'unresolvedWorkCount'
> & {
  sessionId: string;
  work: Pick<
    ComponentProps<typeof ClioObservabilityDock>,
    'runs' | 'tasks' | 'tools' | 'processes'
  >;
};

export function WorkspaceLiveStatusStrip({ sessionId, work, ...props }: LiveStatusStripProps) {
  const stream = useLiveStore((state) => state.entities.stream);
  // The cursor advances on every frame but is only shown while recovering.
  const cursor = useLiveStore((state) =>
    state.entities.stream === 'reconnecting' || state.entities.stream === 'gapped'
      ? state.entities.cursor
      : undefined,
  );
  return (
    <WorkspaceStatusStrip
      {...props}
      activeWorkCount={countActiveWork(work.runs, work.tasks, work.tools, work.processes)}
      unresolvedWorkCount={countWorkNeedingInspection(work.processes)}
      sessionId={sessionId}
      cursor={cursor}
      stream={stream}
    />
  );
}
