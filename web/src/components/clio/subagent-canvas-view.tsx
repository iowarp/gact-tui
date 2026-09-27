import type { Artifact, SubagentRun } from '@clio/core/v3';
import { ArrowUpLeftIcon, BotIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLiveSessionTranscript } from '@/hooks/use-live-session-transcript';
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
  const childSessionId = subagent.child_session_id;
  const assignment = getChildAgentAssignment(subagent);
  const { entities, messages, transcript } = useLiveSessionTranscript(
    workspaceId,
    childSessionId,
    'canvas',
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
          actionLifecycles={entities.a2ui_action_lifecycles}
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
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}
