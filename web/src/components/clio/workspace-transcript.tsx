import type { RunState, Session, WorkspaceReference } from '@clio/core/v3';
import { AnimatePresence, LayoutGroup } from 'motion/react';
import type { ReactNode, RefObject } from 'react';
import type { useAttentionMode } from '@/hooks/use-attention-mode';
import type { useRepository } from '@/hooks/use-repository';
import type { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import type { useSessionMutations } from '@/hooks/use-session-mutations';
import type { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import type { useWorkspaceData } from '@/hooks/use-workspace-data';
import type { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import type { useWorkspaceResourceMap } from '@/hooks/use-workspace-resource-map';
import { canForkSession } from '@/lib/session-state';
import { ClioConversationWelcome } from './conversation-welcome';
import { SessionAttentionTools } from './session-attention-tools';
import type { useWorkspaceQuestions } from './use-workspace-questions';
import { WorkspaceLiveConversation } from './workspace-live-projections';
import * as workspaceRouteState from './workspace-route-state';
import {
  TranscriptPresenceSurface,
  WorkspaceActionAlerts,
  WorkspaceTranscriptAlerts,
} from './workspace-route-surfaces';

type WorkspaceData = ReturnType<typeof useWorkspaceData>;
type SessionMutations = ReturnType<typeof useSessionMutations>;

/**
 * The session's central column: transcript alerts, the attention banner, the
 * welcome screen or the live conversation, and the docked message box. The
 * attention heat and the way it is painted reach the conversation here.
 */
export function WorkspaceTranscript({
  surfaceRef,
  session,
  sessionId,
  workspaceId,
  state,
  data,
  mutations,
  history,
  navigation,
  attention,
  resources,
  repository,
  messageCount,
  damaged,
  navigationActions,
  showWelcome,
  dockedComposerHeight,
  composer,
  onOpenReference,
  onOpenTasks,
  onInteractionResponse,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  session: Session;
  sessionId: string;
  workspaceId: string;
  state: RunState;
  data: Pick<
    WorkspaceData,
    | 'agentLabel'
    | 'artifacts'
    | 'interactions'
    | 'processes'
    | 'streamError'
    | 'subagents'
    | 'transcript'
    | 'transcriptError'
  >;
  mutations: Pick<
    SessionMutations,
    'actionCard' | 'cancelPendingSteer' | 'pendingSteers' | 'retry'
  >;
  history: Pick<ReturnType<typeof useSessionHistoryActions>, 'fork' | 'rewind'>;
  navigation: Pick<
    ReturnType<typeof useWorkbenchNavigation>,
    'conversationNavigation' | 'openFlow' | 'openSubagent' | 'revealWorkbench'
  >;
  attention: ReturnType<typeof useAttentionMode>;
  resources: ReturnType<typeof useWorkspaceResourceMap>;
  repository: ReturnType<typeof useRepository>;
  messageCount: number;
  /** The stored transcript cannot be read; its error stays visible with a removal offer. */
  damaged: boolean;
  navigationActions: ReturnType<typeof useWorkspaceNavigationActions>['navigationActions'];
  showWelcome: boolean;
  dockedComposerHeight: number;
  composer: (variant: 'docked' | 'welcome') => ReactNode;
  onOpenReference: (reference: WorkspaceReference) => void;
  /** A background task's link opens the session's background tasks (Evidence). */
  onOpenTasks: () => void;
  onInteractionResponse: ReturnType<typeof useWorkspaceQuestions>['handleInteractionResponse'];
}) {
  const { transcript, transcriptError } = data;
  const { actionCard, cancelPendingSteer, retry } = mutations;
  const { pendingMessageIds, cancellablePendingMessageIds } =
    workspaceRouteState.pendingSteerMessageIds(mutations.pendingSteers.data ?? []);
  return (
    <section
      ref={surfaceRef}
      data-slot="session-transcript"
      className="relative flex h-full min-w-0 flex-col bg-background"
    >
      <WorkspaceTranscriptAlerts
        sessionFailed={
          session.state === 'failed' && transcript.data?.messages.at(-1)?.stop_reason !== 'error'
        }
        streamError={data.streamError}
        transcriptError={messageCount > 0 || damaged ? transcriptError : undefined}
        removal={damaged ? { actions: navigationActions, session } : undefined}
      />
      <SessionAttentionTools attention={attention} sessionId={sessionId} />
      <LayoutGroup id={`session-layout:${sessionId}`}>
        <AnimatePresence initial={false} mode="popLayout">
          {showWelcome ? (
            <TranscriptPresenceSurface
              className="clio-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6"
              key="welcome"
            >
              <div className="flex min-h-full items-center">
                <ClioConversationWelcome>{composer('welcome')}</ClioConversationWelcome>
              </div>
            </TranscriptPresenceSurface>
          ) : (
            <TranscriptPresenceSurface className="min-h-0 flex-1" key="conversation">
              <WorkspaceLiveConversation
                agentName={data.agentLabel}
                processes={data.processes}
                artifacts={data.artifacts}
                attentionData={attention.heat}
                attentionView={attention.view}
                bottomInset={dockedComposerHeight}
                error={transcriptError}
                onReload={() => void transcript.refetch()}
                hasEarlierMessages={Boolean(transcript.data?.next_cursor)}
                awaitingFirstPage={transcript.isPending}
                loading={transcript.isFetching}
                onActionCardAction={actionCard.mutateAsync}
                {...navigation.conversationNavigation}
                onOpenWork={() =>
                  navigation.revealWorkbench({ kind: 'resources', section: 'work' })
                }
                onOpenReference={onOpenReference}
                onOpenTasks={onOpenTasks}
                onInteractionResponse={onInteractionResponse}
                forkingMessageId={
                  history.fork.isPending && history.fork.variables
                    ? history.fork.variables
                    : undefined
                }
                onForkFromMessage={canForkSession(session) ? history.fork.mutateAsync : undefined}
                onOpenSubagent={navigation.openSubagent}
                onOpenFlow={navigation.openFlow}
                onRewindToMessage={history.rewind.mutateAsync}
                onRetryMessage={retry.mutateAsync}
                cancellablePendingMessageIds={cancellablePendingMessageIds}
                cancellingPendingMessageId={
                  cancelPendingSteer.isPending ? cancelPendingSteer.variables : undefined
                }
                onCancelPendingSteer={cancelPendingSteer.mutateAsync}
                pendingMessageIds={pendingMessageIds}
                rewindingMessageId={history.rewind.isPending ? history.rewind.variables : undefined}
                retryingMessageId={retry.isPending ? retry.variables : undefined}
                resources={resources}
                mcpAppRepository={repository}
                interactions={data.interactions}
                sessionId={sessionId}
                subagents={data.subagents}
                sessionState={state}
                workspaceId={workspaceId}
              />
            </TranscriptPresenceSurface>
          )}
        </AnimatePresence>
        <WorkspaceActionAlerts
          actionError={actionCard.error?.message}
          retryError={retry.error?.message}
        />
        <AnimatePresence initial={false}>{showWelcome ? null : composer('docked')}</AnimatePresence>
      </LayoutGroup>
    </section>
  );
}
