import {
  createEntityState,
  reduceTransportFrame,
  type Artifact,
  type EntityState,
  type Message,
  type SubagentRun,
  type TranscriptSnapshot,
  type TransportFrame,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpLeftIcon, BotIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { recordById } from '@/lib/entities';
import { FrameBatcher } from '@/lib/streaming/frame-batcher';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioConversation } from './conversation';
import { getChildAgentAssignment } from './child-agent-presentation';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';

export interface ClioSubagentCanvasViewProps {
  activeSessionId: string;
  workspaceId: string;
  subagent: SubagentRun;
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenFile: (path: string) => void;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onOpenConversation: (subagent: SubagentRun) => void;
}

export function ClioSubagentCanvasView({
  activeSessionId,
  workspaceId,
  subagent,
  onOpenArtifact,
  onOpenFile,
  onOpenSubagent,
  onOpenConversation,
}: ClioSubagentCanvasViewProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const childSessionId = subagent.child_session_id;
  const assignment = getChildAgentAssignment(subagent);
  const transcript = useQuery({
    queryKey: ['transcript', settings.endpoint, childSessionId, 'canvas'],
    queryFn: ({ signal }) => repository.transcript(childSessionId!, signal),
    enabled: Boolean(childSessionId),
  });
  const snapshotEntities = useMemo(
    () => (transcript.data ? stateFromSnapshot(transcript.data) : createEntityState()),
    [transcript.data],
  );
  const [liveState, setLiveState] = useState<{
    snapshot?: TranscriptSnapshot;
    entities: EntityState;
  }>(() => ({ snapshot: transcript.data, entities: snapshotEntities }));
  const entities = liveState.snapshot === transcript.data ? liveState.entities : snapshotEntities;

  useEffect(() => {
    if (!childSessionId || !transcript.data) return;
    const controller = new AbortController();
    const batcher = new FrameBatcher<TransportFrame>((frames) => {
      setLiveState((current) => {
        const base = current.snapshot === transcript.data ? current.entities : snapshotEntities;
        return {
          snapshot: transcript.data,
          entities: frames.reduce((state, frame) => reduceTransportFrame(state, frame), base),
        };
      });
    });

    void (async () => {
      try {
        for await (const frame of repository.stream(
          {
            connection_id: 'active',
            workspace_id: workspaceId,
            session_id: childSessionId,
          },
          undefined,
          controller.signal,
        )) {
          setLiveState((current) => {
            const base = current.snapshot === transcript.data ? current.entities : snapshotEntities;
            return {
              snapshot: transcript.data,
              entities: base.stream === 'live' ? base : { ...base, stream: 'live' },
            };
          });
          batcher.push(frame);
        }
      } catch {
        if (!controller.signal.aborted) {
          setLiveState((current) => {
            const base = current.snapshot === transcript.data ? current.entities : snapshotEntities;
            return {
              snapshot: transcript.data,
              entities: { ...base, stream: 'reconnecting' },
            };
          });
        }
      }
    })();

    return () => {
      controller.abort();
      batcher.stop({ flush: true });
    };
  }, [childSessionId, repository, snapshotEntities, transcript.data, workspaceId]);

  const messages = useMemo(
    () =>
      Object.values(entities.messages)
        .filter((message): message is Message => message.session_id === childSessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [childSessionId, entities.messages],
  );

  if (!childSessionId) {
    return (
      <Alert className="m-4" variant="destructive">
        <AlertTitle>Child conversation unavailable</AlertTitle>
        <AlertDescription>
          The service did not provide a child-session destination.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b bg-card/50 px-4 py-3">
        <div className="flex items-start gap-3">
          <BotIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-medium">{subagent.title}</h2>
              <ClioStatus value={subagent.state} />
              {entities.stream === 'live' ? null : (
                <ClioStatus detail="Child transcript connection" value={entities.stream} />
              )}
            </div>
            <p
              className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"
              title={assignment.detail ?? assignment.label}
            >
              {assignment.label}
            </p>
          </div>
          {childSessionId === activeSessionId ? (
            <ClioStatus
              className="shrink-0"
              detail="This child conversation is open in the central column"
              label="Central view"
              value="healthy"
            />
          ) : (
            <Button
              className="shrink-0"
              onClick={() => onOpenConversation(subagent)}
              size="sm"
              variant="outline"
            >
              <ArrowUpLeftIcon aria-hidden="true" />
              Make central
            </Button>
          )}
        </div>
      </header>
      {transcript.error && messages.length > 0 ? (
        <Alert className="m-3 mb-0" variant="destructive">
          <AlertTitle>Child transcript unavailable</AlertTitle>
          <AlertDescription>{transcript.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="min-h-0 flex-1">
        <ClioConversation
          artifacts={entities.artifacts}
          error={transcript.error?.message}
          loading={transcript.isPending}
          messages={messages}
          onOpenArtifact={onOpenArtifact}
          onOpenFile={onOpenFile}
          onOpenSubagent={onOpenSubagent}
          subagents={entities.subagents}
          surfaces={entities.surfaces}
          tasks={entities.tasks}
          tools={entities.tools}
        />
      </div>
    </div>
  );
}

function stateFromSnapshot(snapshot: TranscriptSnapshot): EntityState {
  return {
    ...createEntityState(),
    stream: 'connecting',
    messages: recordById(snapshot.messages),
    tools: recordById(snapshot.tools),
    tasks: recordById(snapshot.tasks),
    subagents: recordById(snapshot.subagents),
    artifacts: recordById(snapshot.artifacts),
    surfaces: recordById(snapshot.surfaces),
  };
}
