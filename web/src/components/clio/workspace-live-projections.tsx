import type { Artifact, Message } from '@clio/core/v3';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { useLiveStore } from '@/store/live-store';
import { ClioConversation, type ClioConversationProps } from './conversation';
import { ClioObservabilityDock, ClioObservabilityView } from './observability-dock';
import { WorkspaceStatusStrip } from './workspace-route-surfaces';

function useSessionMessages(sessionId: string): Message[] {
  const messages = useLiveStore((state) => state.entities.messages);
  return useMemo(
    () =>
      Object.values(messages)
        .filter((message): message is Message => message.session_id === sessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [messages, sessionId],
  );
}

type LiveConversationProps = Omit<
  ClioConversationProps,
  'artifacts' | 'messages' | 'subagents' | 'surfaces' | 'tasks' | 'tools'
> & {
  artifacts: readonly Artifact[];
  sessionId: string;
};

/** Isolates high-rate message updates from the surrounding workspace chrome. */
export function WorkspaceLiveConversation({
  artifacts: artifactList,
  sessionId,
  ...props
}: LiveConversationProps) {
  const messageEntities = useLiveStore((state) => state.entities.messages);
  const subagents = useLiveStore((state) => state.entities.subagents);
  const surfaces = useLiveStore((state) => state.entities.surfaces);
  const tasks = useLiveStore((state) => state.entities.tasks);
  const tools = useLiveStore((state) => state.entities.tools);
  const messages = useMemo(
    () =>
      Object.values(messageEntities)
        .filter((message): message is Message => message.session_id === sessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [messageEntities, sessionId],
  );
  const artifacts = useMemo(
    () => Object.fromEntries(artifactList.map((artifact) => [artifact.id, artifact])),
    [artifactList],
  );
  const entities = useMemo(
    () => ({ artifacts, subagents, surfaces, tasks, tools }),
    [artifacts, subagents, surfaces, tasks, tools],
  );
  return <ClioConversation {...entities} {...props} messages={messages} />;
}

type LiveObservabilityDockProps = Omit<ComponentProps<typeof ClioObservabilityDock>, 'messages'> & {
  sessionId: string;
};

export function WorkspaceLiveObservabilityDock({
  sessionId,
  ...props
}: LiveObservabilityDockProps) {
  const infrastructure = useLiveStore((state) => state.entities.infrastructure);
  const activeTurnId = useLiveStore((state) => state.entities.active_turns[sessionId]);
  const activeTurnResponded = useLiveStore(
    (state) => state.entities.responded_turns[sessionId] === activeTurnId,
  );
  const infrastructureDependencies = useMemo(
    () => Object.values(infrastructure).filter((item) => item.session_id === sessionId),
    [infrastructure, sessionId],
  );
  return (
    <ClioObservabilityDock
      {...props}
      activeTurnId={activeTurnId}
      activeTurnResponded={activeTurnResponded}
      infrastructureDependencies={infrastructureDependencies}
      messages={useSessionMessages(sessionId)}
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
  return <ClioObservabilityView {...props} messages={useSessionMessages(sessionId)} />;
}

type LiveStatusStripProps = Omit<
  ComponentProps<typeof WorkspaceStatusStrip>,
  'cost' | 'cursor' | 'inputTokens' | 'stream'
> & { sessionId: string };

export function WorkspaceLiveStatusStrip({ sessionId, ...props }: LiveStatusStripProps) {
  const cost = useLiveStore((state) => state.entities.usage[sessionId]?.cost_usd);
  const cursor = useLiveStore((state) => state.entities.cursor);
  const inputTokens = useLiveStore((state) => state.entities.usage[sessionId]?.input_tokens);
  const stream = useLiveStore((state) => state.entities.stream);
  return (
    <WorkspaceStatusStrip
      {...props}
      cost={cost}
      cursor={cursor}
      inputTokens={inputTokens}
      stream={stream}
    />
  );
}
