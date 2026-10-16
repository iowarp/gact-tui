import type {
  Message,
  PendingInteraction,
  PendingInteractionResponse,
  ToolInvocation,
} from '@clio/core/v3';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AttentionDraftContext, createAttentionDraftStore } from './attention-drafts';
import type { SessionSendInput } from '@/hooks/use-session-mutations';
import { ClioPendingInteractions, type ClioPendingInteractionsProps } from './pending-interactions';
import { AgentQuestionDialog } from './agent-question-dialog';
import { revealPendingInteraction } from './interaction-control';
import { useQuestionAnswering } from './use-question-answering';
import * as workspaceRouteState from './workspace-route-state';
import {
  embedsQuestionSurface,
  questionSurfaceMetadata,
  type SurfaceQuestionTarget,
} from '@/lib/a2ui/question-navigation';

type Respond = (
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
) => Promise<void>;

interface UseWorkspaceQuestionsInput {
  interactions: readonly PendingInteraction[];
  tools: readonly ToolInvocation[];
  messages: readonly Message[];
  focusComposer: () => void;
  /** Answer one interaction through its own response route. */
  respondInteraction: (input: {
    interaction: PendingInteraction;
    response: PendingInteractionResponse;
  }) => Promise<unknown>;
  send: (value: SessionSendInput) => Promise<unknown>;
  /** Reveal the owning child canvas without changing the central conversation. */
  revealSurfaceOwner?: (ownerSessionId: string) => boolean | void;
  /** The response tray's remaining props (surfaces, owner labels, errors, ...). */
  tray: Omit<ClioPendingInteractionsProps, 'interactions' | 'onResponse'>;
}

/**
 * The workspace's human-response wiring in one place: the answer handler every
 * surface shares, the agent's questions (inline cards, the composer answer
 * route, the notice), and the panel stacked on the composer -- the notice over
 * the response tray, which keeps the interactions the log does not own.
 */
export function useWorkspaceQuestions({
  interactions,
  tools,
  messages,
  focusComposer,
  respondInteraction,
  send,
  revealSurfaceOwner,
  tray,
}: UseWorkspaceQuestionsInput): {
  handleInteractionResponse: Respond;
  questionAnswering: ReturnType<typeof useQuestionAnswering>;
  pendingInteractionsPanel: ReactNode;
} {
  const sessionId = tray.viewedSessionId;
  const drafts = useMemo(() => createAttentionDraftStore(sessionId), [sessionId]);
  const [openedId, setOpenedId] = useState<string>();
  const [surfaceTarget, setSurfaceTarget] = useState<SurfaceQuestionTarget>();
  const openSurfaceQuestion = useCallback(
    (interaction: PendingInteraction) => {
      const surfaceId = interaction.source.surface_id;
      if (!surfaceId) return;
      if (
        interaction.owner_session_id !== sessionId &&
        revealSurfaceOwner?.(interaction.owner_session_id) === false
      )
        return;
      setSurfaceTarget((previous) => ({
        sessionId: interaction.owner_session_id,
        surfaceId,
        answerAction: String(
          questionSurfaceMetadata(interaction)['a2ui_answer_action'] || 'question.submit',
        ),
        request: (previous?.request ?? 0) + 1,
      }));
    },
    [revealSurfaceOwner, sessionId],
  );
  const handleInteractionResponse = useCallback<Respond>(
    async (interaction, response) => {
      await respondInteraction({ interaction, response });
    },
    [respondInteraction],
  );
  const questionAnswering = useQuestionAnswering({
    interactions,
    tools,
    messages,
    sessionId,
    focusComposer,
    respond: handleInteractionResponse,
    send,
  });
  const trayInteractions = workspaceRouteState.responseTrayInteractions(
    interactions,
    new Set(tools.map((tool) => tool.id)),
  );
  const pendingInteractionsPanel = (
    <AttentionDraftContext.Provider value={drafts}>
      {questionAnswering.context.answeringId ? questionAnswering.notice : null}
      <AgentQuestionDialog
        interaction={interactions.find((row) => row.id === openedId && row.status === 'pending')}
        onClose={() => setOpenedId(undefined)}
        onResponse={handleInteractionResponse}
      />
      <ClioPendingInteractions
        {...tray}
        interactions={trayInteractions}
        onResponse={handleInteractionResponse}
        onOpenSurfaceQuestion={openSurfaceQuestion}
      />
    </AttentionDraftContext.Provider>
  );
  return {
    handleInteractionResponse,
    questionAnswering: {
      ...questionAnswering,
      context: {
        ...questionAnswering.context,
        interactions,
        openQuestion: (interaction: PendingInteraction) => {
          if (interaction.source.surface_id && !embedsQuestionSurface(interaction))
            openSurfaceQuestion(interaction);
          else if (trayInteractions.some((row) => row.id === interaction.id))
            revealPendingInteraction(interaction.id);
          else setOpenedId(interaction.id);
        },
        openSurfaceQuestion,
        surfaceTarget,
        surfaces: tray.surfaces,
        refetchSurfaces: tray.onRefetchSurfaces,
      },
    },
    pendingInteractionsPanel,
  };
}
