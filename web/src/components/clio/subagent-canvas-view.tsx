import type { Artifact, SubagentRun } from '@clio/core/v3';
import { ArrowUpLeftIcon, BotIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLiveSessionTranscript } from '@/hooks/use-live-session-transcript';
import { ClioConversation } from './conversation';
import { SubagentModel } from './subagent-model';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { ChildConversationFollowup } from './child-conversation-followup';
import { useContext } from 'react';
import { PresentationNavigation } from './presentation-navigation';

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
  const navigation = useContext(PresentationNavigation);
  const childSessionId = subagent.child_session_id;
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
            <BotIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-medium">{subagent.title}</h2>
                <ClioStatus value={subagent.state} />
                {subagent.agent_id ? (
                  <span className="text-xs text-muted-foreground">{subagent.agent_id}</span>
                ) : null}
                {subagent.model_choice ? <SubagentModel choice={subagent.model_choice} /> : null}
                {entities.stream === 'live' ? null : (
                  <ClioStatus detail="Child transcript connection" value={entities.stream} />
                )}
              </div>
            </div>
          </div>
          {childSessionId === activeSessionId ? (
            <ClioStatus
              className="ml-auto shrink-0"
              detail="This child conversation is open in the central column"
              label="Central view"
              value="healthy"
            />
          ) : (
            <Button
              className="ml-auto shrink-0"
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
          agentName={subagent.title}
          sessionId={childSessionId}
          actionLifecycles={entities.a2ui_action_lifecycles}
          artifacts={entities.artifacts}
          error={transcript.error?.message}
          loading={transcript.isPending}
          messages={messages}
          onOpenArtifact={onOpenArtifact}
          onOpenFile={onOpenFile}
          onOpenFileReference={navigation?.onOpenFileReference}
          onOpenSubagent={onOpenSubagent}
          subagents={entities.subagents}
          surfaces={entities.surfaces}
          tasks={entities.tasks}
          tools={entities.tools}
          workspaceId={workspaceId}
        />
      </div>
      <ChildConversationFollowup
        sessionId={childSessionId}
        parentSessionId={subagent.session_id}
        workspaceId={workspaceId}
      />
    </div>
  );
}
