import type { RunState, Session, WorkspaceReference } from '@clio/core/v3';
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import type { ComposerDraft } from '@/hooks/use-composer-draft';
import type { useSessionCommands } from '@/hooks/use-session-commands';
import type { useSessionMutations } from '@/hooks/use-session-mutations';
import type { useSpotterQuarantine } from '@/hooks/use-spotter-quarantine';
import type { useWorkspaceData } from '@/hooks/use-workspace-data';
import { isManagedChildSession } from '@/lib/session-state';
import { sessionSpotterModel } from '@/lib/spotter-model-ref';
import { ClioChildSessionFooter } from './child-session-footer';
import { ClioComposer } from './composer';
import { sessionPatchForMessageBehavior } from './session-behavior-options';
import type { useWorkspaceQuestions } from './use-workspace-questions';
import * as workspaceRouteState from './workspace-route-state';

type WorkspaceData = ReturnType<typeof useWorkspaceData>;
type SessionMutations = ReturnType<typeof useSessionMutations>;

/** Whether the conversation has started, and how to record a start that failed. */
export interface ConversationStart {
  /** The welcome screen is showing, so a send now starts the conversation. */
  welcome: boolean;
  messageCount: number;
  setStarted: (started: boolean) => void;
}

export interface WorkspaceComposerProps {
  variant: 'docked' | 'welcome';
  session: Session;
  sessionId: string;
  workspaceId: string;
  state: RunState;
  data: Pick<
    WorkspaceData,
    | 'activeEffort'
    | 'activeModel'
    | 'activeProvider'
    | 'capabilities'
    | 'configuredEffort'
    | 'modelCatalogStatus'
    | 'modelOptions'
    | 'parentSession'
    | 'providerCatalog'
    | 'workspaceResources'
  >;
  mutations: Pick<
    SessionMutations,
    | 'cancel'
    | 'deleteQueuedMessage'
    | 'discardFiles'
    | 'prepareFiles'
    | 'promoteQueuedMessage'
    | 'queuedMessages'
    | 'reorderQueuedMessages'
    | 'send'
    | 'updateQueuedMessage'
    | 'updateSessionBehavior'
  >;
  commands: ReturnType<typeof useSessionCommands>;
  draft: ComposerDraft;
  conversation: ConversationStart;
  /** A SPOTTER quarantine holds the message box and shows its card. */
  hold: ReturnType<typeof useSpotterQuarantine>;
  catalogPreparing: boolean;
  focusRequestKey: number;
  pendingInteractions: ReactNode;
  submit: ReturnType<typeof useWorkspaceQuestions>['questionAnswering']['submit'];
  onHeightChange: (height: number) => void;
  onReturnToParent: () => void;
  onOpenResource: Parameters<typeof ClioComposer>[0]['onOpenResource'];
  onOpenReference: (reference: WorkspaceReference) => void;
}

/**
 * The session's message box, docked under the transcript or inside the welcome
 * screen. A managed child session shows its footer instead. A send from the
 * welcome screen marks the conversation started, and a send that fails before
 * any message exists returns to the welcome screen.
 */
export function WorkspaceComposer({
  variant,
  session,
  sessionId,
  workspaceId,
  state,
  data,
  mutations,
  commands,
  draft,
  conversation,
  hold,
  catalogPreparing,
  focusRequestKey,
  pendingInteractions,
  submit,
  onHeightChange,
  onReturnToParent,
  onOpenResource,
  onOpenReference,
}: WorkspaceComposerProps) {
  const {
    cancel,
    deleteQueuedMessage,
    promoteQueuedMessage,
    reorderQueuedMessages,
    updateQueuedMessage,
  } = mutations;
  const startingConversation = async (action: () => Promise<unknown>) => {
    const startedFromWelcome = conversation.welcome;
    if (startedFromWelcome) conversation.setStarted(true);
    try {
      await action();
    } catch (error) {
      if (startedFromWelcome && conversation.messageCount === 0) conversation.setStarted(false);
      throw error;
    }
  };
  const docked = variant === 'docked';
  return (
    <m.div
      className={
        docked
          ? 'pointer-events-none absolute inset-0 z-20 flex min-h-0 flex-col justify-end'
          : 'w-full'
      }
      // A session's welcome composer registers fresh so it can hand off to its docked one.
      // The layoutId is constant: motion keeps one shared-layout stack per id for the life
      // of the page, so per-session ids leaked a stack (and a dead composer) per conversation.
      // WorkspaceTranscript resets those stacks when the session changes, so nothing
      // animates across sessions.
      key={docked ? 'docked' : `welcome:${sessionId}`}
      layout
      layoutId="session-composer"
    >
      {isManagedChildSession(session) ? (
        <ClioChildSessionFooter
          session={session}
          onHeightChange={docked ? onHeightChange : undefined}
          onReturnToParent={onReturnToParent}
          parentTitle={data.parentSession?.title ?? 'Parent conversation'}
          pendingInteractions={pendingInteractions}
          state={state}
          variant={variant}
        />
      ) : (
        <ClioComposer
          sessionId={sessionId}
          catalogPreparing={catalogPreparing}
          attachments={workspaceRouteState.canUploadWorkspaceResources(
            data.capabilities.data?.capabilities,
          )}
          contextReferences={workspaceRouteState.canUseContextReferences(
            data.capabilities.data?.capabilities,
          )}
          commands={commands.commands}
          confirmationPolicy={session.approval_mode === 'unknown' ? 'ask' : session.approval_mode}
          disabled={
            mutations.send.isPending || cancel.isPending || commands.isPending || hold.active
          }
          effort={data.activeEffort}
          configuredEffort={data.configuredEffort}
          executionMode={
            session.mode === 'plan'
              ? 'plan'
              : session.mode === 'architect'
                ? 'deep_research'
                : 'execute'
          }
          focusRequestKey={focusRequestKey}
          // Keyed on the session alone: provider/model/effort resolving after
          // navigation used to remount this whole subtree, silently dropping
          // in-progress attachments and other composer-local state. ClioComposer
          // reconciles those props into its own selection state (see
          // `modelSelection`/`behaviorSelection`) instead of needing a remount.
          key={`composer:${sessionId}`}
          model={data.activeModel}
          modelCatalogStatus={data.modelCatalogStatus}
          modelOptions={data.modelOptions}
          pendingInteractions={hold.withCard(pendingInteractions)}
          onCommand={(value) => startingConversation(() => commands.run(value))}
          onRetryModelCatalog={(providerId) => void data.providerCatalog.refreshCatalog(providerId)}
          onBehaviorChange={async (behavior) => {
            await mutations.updateSessionBehavior.mutateAsync(
              sessionPatchForMessageBehavior(behavior),
            );
          }}
          spotterModel={sessionSpotterModel(session.metadata)}
          onSpotterModelChange={async (ref) => {
            await mutations.updateSessionBehavior.mutateAsync({ spotter_model: ref });
          }}
          onPrepareFiles={mutations.prepareFiles}
          onDiscardFiles={mutations.discardFiles}
          onHeightChange={docked ? onHeightChange : undefined}
          onSubmit={(value) => startingConversation(() => submit(value))}
          onStop={() => cancel.mutate()}
          onOpenResource={onOpenResource}
          onOpenReference={onOpenReference}
          onDeleteQueuedMessage={(message) => deleteQueuedMessage.mutateAsync(message)}
          onPromoteQueuedMessage={(message, delivery) =>
            promoteQueuedMessage.mutateAsync({ delivery, message }).then(() => undefined)
          }
          onReorderQueuedMessages={(messages) =>
            reorderQueuedMessages.mutateAsync(messages).then(() => undefined)
          }
          onUpdateQueuedMessage={(message, text) =>
            updateQueuedMessage.mutateAsync({ message, text }).then(() => undefined)
          }
          annotations={draft.annotations}
          onAnnotationsChange={draft.onAnnotationsChange}
          onReferencesChange={draft.onReferencesChange}
          onValueChange={draft.onValueChange}
          provider={data.activeProvider}
          queuedMessages={mutations.queuedMessages.data ?? []}
          queuePaused={session.metadata?.composer_queue_paused === true}
          resources={data.workspaceResources.data ?? []}
          queueBusy={
            deleteQueuedMessage.isPending ||
            promoteQueuedMessage.isPending ||
            reorderQueuedMessages.isPending ||
            updateQueuedMessage.isPending
          }
          state={state}
          references={draft.references}
          value={draft.value}
          variant={variant}
          workspaceId={workspaceId}
        />
      )}
    </m.div>
  );
}
