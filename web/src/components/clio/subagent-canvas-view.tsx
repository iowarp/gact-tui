import type { Artifact, SubagentRun } from '@clio/core/v3';
import { ArrowUpLeftIcon } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLiveSessionTranscript } from '@/hooks/use-live-session-transcript';
import { useNow } from '@/hooks/use-now';
import { formatDuration } from '@/lib/format';
import { useLiveStore } from '@/store/live-store';
import { ClioConversation } from './conversation';
import { SubagentModel } from './subagent-model';
import { clioStatusLabel } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { ChildConversationFollowup } from './child-conversation-followup';
import { PresentationNavigation } from './presentation-navigation';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { t } from '@lingui/core/macro';

/** The child transcript's connection, as the lower-case word beside the crumbs. */
function streamWord(stream: Parameters<typeof clioStatusLabel>[0]): string {
  switch (stream) {
    case 'connecting':
      return t({ message: 'connecting', context: 'transcript connection state' });
    case 'reconnecting':
      return t({ message: 'reconnecting', context: 'transcript connection state' });
    case 'gapped':
      return t({ message: 'stream gap', context: 'transcript connection state' });
    case 'offline':
      return t({ message: 'offline', context: 'transcript connection state' });
    default:
      return clioStatusLabel(stream);
  }
}

export interface ClioSubagentCanvasViewProps {
  activeSessionId: string;
  workspaceId: string;
  subagent: SubagentRun;
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenFile: (path: string) => void;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onOpenConversation: (subagent: SubagentRun) => void;
}

/**
 * The bar above a child's transcript: parent conversation › child name, its
 * state and elapsed time with the agent and model, and Make central.
 */
function SubagentFrame({
  subagent,
  what,
  actions,
  children,
}: {
  subagent: SubagentRun;
  what?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const parentTitle = useLiveStore((state) => state.entities.sessions[subagent.session_id]?.title);
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <FrameBar
        actions={actions}
        label={t`Conversation actions`}
        what={what}
        where={
          <FrameCrumbs
            parts={
              parentTitle
                ? [{ label: parentTitle }, { label: subagent.title }]
                : [{ label: subagent.title }]
            }
          />
        }
      />
      {children}
    </div>
  );
}

/** "running 2m", "completed 14m": the child's state in words and how long it ran. */
function stateFact(subagent: SubagentRun, startedAt: string | undefined, now: number): string {
  const word = subagent.state.replaceAll('_', ' ');
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  const span =
    subagent.state === 'running' && Number.isFinite(started) ? now - started : subagent.duration_ms;
  return span === undefined || span < 0 ? word : `${word} ${formatDuration(span, 'compact')}`;
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
  const { entities, messages, transcript, earlier } = useLiveSessionTranscript(
    workspaceId,
    childSessionId,
    'canvas',
  );
  // The child's live turn, as the main conversation knows its own: the running
  // activity stays open step by step and folds once the answer begins.
  const activeTurnId = childSessionId ? entities.active_turns[childSessionId] : undefined;
  const childSession = childSessionId ? entities.sessions[childSessionId] : undefined;
  const preparation = {
    sessionState:
      childSession?.state ?? (subagent.state === 'running' ? ('running' as const) : undefined),
    activeTurnId,
    activeTurnResponded: Boolean(
      activeTurnId && childSessionId && entities.responded_turns[childSessionId] === activeTurnId,
    ),
  };

  const now = useNow(subagent.state === 'running');

  if (!childSessionId) {
    return (
      <SubagentFrame subagent={subagent}>
        <StateView
          className="min-h-0 flex-1"
          detail={t`The service did not provide a child-session destination.`}
          kind="unavailable"
          size="viewer"
          title={t`Child conversation unavailable`}
        />
      </SubagentFrame>
    );
  }

  return (
    <SubagentFrame
      actions={
        childSessionId === activeSessionId ? (
          <span className="px-1 text-caption text-muted-foreground">{t`In the central column`}</span>
        ) : (
          <IconButton
            icon={<ArrowUpLeftIcon />}
            label={t`Make central`}
            onClick={() => onOpenConversation(subagent)}
            size="sm"
          />
        )
      }
      subagent={subagent}
      what={
        <>
          <span className="tabular-nums" data-frame-position="">
            {stateFact(subagent, childSession?.created_at, now)}
          </span>
          {subagent.agent_id ? <span>{subagent.agent_id}</span> : null}
          {subagent.model_choice ? (
            <span className="flex min-w-0 [&_[data-slot=subagent-model]]:border-0 [&_[data-slot=subagent-model]]:p-0 [&_[data-slot=subagent-model]]:text-caption">
              <SubagentModel choice={subagent.model_choice} />
            </span>
          ) : null}
          {entities.stream === 'live' ? null : (
            <span title={t`Child transcript connection`}>{streamWord(entities.stream)}</span>
          )}
        </>
      }
    >
      {transcript.error && messages.length > 0 ? (
        <Alert className="m-3 mb-0" variant="destructive">
          <AlertTitle>{t`Child transcript unavailable`}</AlertTitle>
          <AlertDescription>{transcript.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="min-h-0 flex-1">
        <ClioConversation
          agentName={subagent.title}
          sessionId={childSessionId}
          actionLifecycles={entities.a2ui_action_lifecycles}
          artifacts={entities.artifacts}
          earlier={earlier}
          error={transcript.error?.message}
          loading={transcript.isPending}
          messages={messages}
          onOpenArtifact={onOpenArtifact}
          onOpenFile={onOpenFile}
          onOpenFileReference={navigation?.onOpenFileReference}
          onOpenSubagent={onOpenSubagent}
          preparation={preparation}
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
    </SubagentFrame>
  );
}
