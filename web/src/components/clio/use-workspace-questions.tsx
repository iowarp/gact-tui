import type {
  Message,
  PendingInteraction,
  PendingInteractionResponse,
  ToolInvocation,
} from '@clio/core/v3';
import { useCallback, type ReactNode } from 'react';
import type { SessionSendInput } from '@/hooks/use-session-mutations';
import { ClioPendingInteractions, type ClioPendingInteractionsProps } from './pending-interactions';
import { useQuestionAnswering } from './use-question-answering';
import * as workspaceRouteState from './workspace-route-state';

type Respond = (
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
) => Promise<void>;

interface UseWorkspaceQuestionsInput {
  interactions: readonly PendingInteraction[];
  tools: readonly ToolInvocation[];
  messages: readonly Message[];
  sessionId: string;
  focusComposer: () => void;
  /** Answer one interaction through its own response route. */
  respondInteraction: (input: {
    interaction: PendingInteraction;
    response: PendingInteractionResponse;
  }) => Promise<unknown>;
  send: (value: SessionSendInput) => Promise<unknown>;
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
  sessionId,
  focusComposer,
  respondInteraction,
  send,
  tray,
}: UseWorkspaceQuestionsInput): {
  handleInteractionResponse: Respond;
  questionAnswering: ReturnType<typeof useQuestionAnswering>;
  pendingInteractionsPanel: ReactNode;
} {
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
    <>
      {questionAnswering.notice}
      <ClioPendingInteractions
        {...tray}
        interactions={trayInteractions}
        onResponse={handleInteractionResponse}
      />
    </>
  );
  return { handleInteractionResponse, questionAnswering, pendingInteractionsPanel };
}
