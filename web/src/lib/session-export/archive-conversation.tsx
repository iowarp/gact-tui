import { useMemo, useState } from 'react';
import {
  messageSchema,
  toolInvocationSchema,
  taskSchema,
  subagentSchema,
  artifactSchema,
  a2uiSurfaceSchema,
  pendingInteractionSchema,
  type SessionReviewSnapshot,
} from '@clio/core/v3';
import { ConversationMessageRow } from '@/components/clio/conversation-message-row';
import { PresentationNavigation } from '@/components/clio/presentation-navigation';
import {
  foldA2UIRevisionBlocks,
  isProjectionOnlyA2UIMessage,
  projectA2UIActionMessages,
  isProjectedQuestionResumeEnvelope,
} from '@/components/clio/conversation-message-projection';
import type { ClioConversationProps } from '@/components/clio/conversation-types';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';
import { messageMarkIds } from '@/lib/message-marks';
import { withAskingCall, withForkSessionLink } from './archive-orchestration-model';

export interface ArchiveTranscriptView {
  messages: unknown[];
  tools: unknown[];
  tasks: unknown[];
  subagents: unknown[];
  artifacts: unknown[];
  surfaces: unknown[];
  interactions?: unknown[];
}

/** Render the saved ledger through the same rows, activity and tool UI as CLIO. */
export function ArchiveConversation({
  sessionId,
  metadata,
  view,
  snapshot,
  onOpenArtifact,
  onOpenFile,
  onOpenSubagent,
  onOpenFolder,
  folderAvailable,
  nodeFolder,
  onOpenSession,
  sessionAvailable,
}: {
  sessionId: string;
  metadata?: Record<string, unknown>;
  view: ArchiveTranscriptView;
  snapshot: SessionReviewSnapshot;
  onOpenArtifact: ClioConversationProps['onOpenArtifact'];
  onOpenFile: ClioConversationProps['onOpenFile'];
  /** Open a child agent's conversation (its section of the archive). */
  onOpenSubagent?: ClioConversationProps['onOpenSubagent'];
  /** Show a folder's included files; only folders `folderAvailable` accepts open. */
  onOpenFolder?: (path: string) => void;
  folderAvailable?: (path: string) => boolean;
  /** The folder each exported session worked in, from its recorded metadata. */
  nodeFolder?: (sessionId: string) => string | undefined;
  /** Open an exported session's section; only sessions `sessionAvailable` accepts open. */
  onOpenSession?: (sessionId: string) => void;
  sessionAvailable?: (sessionId: string) => boolean;
}) {
  const markedMessageIds = useMemo(() => messageMarkIds(metadata), [metadata]);
  const [modes, setModes] = useState<Record<string, ConversationDisplayMode>>({});
  const entities = useMemo(() => {
    const index = <T extends { id: string }>(values: T[]) =>
      Object.fromEntries(values.map((value) => [value.id, value]));
    const captured = snapshot.responses[
      `GET /v1/sessions/${encodeURIComponent(sessionId)}/interactions?include_recent_resolved=true&resolved_limit=100`
    ]?.json as { interactions?: unknown[] } | undefined;
    const tools = view.tools.map((value) => withForkSessionLink(toolInvocationSchema.parse(value)));
    const recorded = [
      ...new Map(
        [...(captured?.interactions ?? []), ...(view.interactions ?? [])].map((value) => {
          const interaction = pendingInteractionSchema.parse(value);
          return [interaction.id, interaction] as const;
        }),
      ).values(),
    ];
    const interactions = withAskingCall(recorded, tools, sessionId);
    const messages = foldA2UIRevisionBlocks(
      projectA2UIActionMessages(
        view.messages
          .map((value) => messageSchema.parse(value))
          .filter(
            (message) =>
              !isProjectionOnlyA2UIMessage(message) &&
              !isProjectedQuestionResumeEnvelope(message, interactions),
          ),
      ),
    );
    const artifacts = view.artifacts.map((value) => {
      const artifact = artifactSchema.parse(value);
      const captured = snapshot.responses[`GET /v1/artifacts/${encodeURIComponent(artifact.id)}`]
        ?.json as { artifact?: unknown } | undefined;
      return captured?.artifact ? artifactSchema.parse(captured.artifact) : artifact;
    });
    return {
      messages,
      interactions,
      tools: index(tools),
      tasks: index(view.tasks.map((value) => taskSchema.parse(value))),
      subagents: index(view.subagents.map((value) => subagentSchema.parse(value))),
      artifacts: index(artifacts),
      surfaces: index(
        (snapshot.sessions[sessionId] ?? view.surfaces).map((value) =>
          a2uiSurfaceSchema.parse(value),
        ),
      ),
    };
  }, [sessionId, snapshot, view]);
  return (
    <A2uiReferenceSessionProvider value={sessionId}>
      <PresentationNavigation.Provider
        value={{
          ...entities,
          onOpenArtifact,
          onOpenFile,
          onOpenSubagent,
          onOpenFolder,
          folderAvailable,
          nodeFolder,
          onOpenSession,
          sessionAvailable,
        }}
      >
        <section id={sessionId} className="flex min-w-0 flex-col gap-6">
          {entities.messages.map((message, index) => (
            <ConversationMessageRow
              key={message.id}
              {...entities}
              markedMessageIds={markedMessageIds}
              message={message}
              index={index}
              recent={false}
              displayMode={modes[message.id] ?? 'chain'}
              onDisplayModeChange={(mode) =>
                setModes((current) => ({ ...current, [message.id]: mode }))
              }
              onOpenArtifact={onOpenArtifact}
              onOpenFile={onOpenFile}
              onOpenSubagent={onOpenSubagent}
            />
          ))}
        </section>
      </PresentationNavigation.Provider>
    </A2uiReferenceSessionProvider>
  );
}
