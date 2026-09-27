import type {
  Message,
  PendingInteraction,
  PendingInteractionResponse,
  ToolInvocation,
} from '@clio/core/v3';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  followTranscriptLink,
  pendingLogQuestions,
  questionAnswerFromComposer,
  questionLink,
} from '@/lib/inline-question';
import type { SessionSendInput } from '@/hooks/use-session-mutations';
import { planRevisionFromComposer } from './workspace-route-state';
import { PendingQuestionNotice } from './pending-question-notice';
import type { QuestionAnswerState } from './question-answer-context';

interface UseQuestionAnsweringInput {
  interactions: readonly PendingInteraction[];
  tools: readonly ToolInvocation[];
  messages: readonly Message[];
  /** The session the composer sends to. */
  sessionId: string;
  /** Move focus to the main composer (an "Other answer" goes there). */
  focusComposer: () => void;
  /** Answer an interaction through its own response route. */
  respond: (interaction: PendingInteraction, response: PendingInteractionResponse) => Promise<void>;
  /** Send a composer message. */
  send: (value: SessionSendInput) => Promise<unknown>;
}

interface QuestionAnswering {
  /** The value for `QuestionAnswerContext` (read by the inline question cards). */
  context: QuestionAnswerState;
  /** The notice over the composer, or `null` when no question is waiting. */
  notice: ReactNode;
  /**
   * Submit the composer: the answer to the question picked with "Other answer"
   * (text through its route, attachments as the answering message), plan
   * feedback while a plan review waits, or an ordinary message.
   */
  submit: (value: SessionSendInput) => Promise<void>;
}

/**
 * The workspace's agent-question wiring: which pending questions sit in the
 * log, which one the composer is answering, and the notice that links to
 * them. A pending question never blocks the composer: an ordinary message is
 * still sent as a message, and the question stays open in the log.
 */
export function useQuestionAnswering({
  interactions,
  tools,
  messages,
  sessionId,
  focusComposer,
  respond,
  send,
}: UseQuestionAnsweringInput): QuestionAnswering {
  const [answeringId, setAnsweringId] = useState<string>();
  const toolIds = useMemo(() => new Set(tools.map((tool) => tool.id)), [tools]);
  const questions = useMemo(
    () => pendingLogQuestions(interactions, toolIds),
    [interactions, toolIds],
  );
  // Read the live row: a question answered or expired elsewhere stops being a target.
  const answering = questions.find((question) => question.id === answeringId);
  const stopAnswer = useCallback(() => setAnsweringId(undefined), []);
  const context = useMemo<QuestionAnswerState>(
    () => ({
      answeringId: answering?.id,
      startAnswer: (interactionId) => {
        setAnsweringId(interactionId);
        focusComposer();
      },
      stopAnswer,
    }),
    [answering?.id, focusComposer, stopAnswer],
  );
  const goToQuestion = useCallback(
    (question: PendingInteraction) => {
      const link = questionLink(messages, question);
      if (link) followTranscriptLink(link);
    },
    [messages],
  );
  const notice =
    questions.length > 0 ? (
      <PendingQuestionNotice
        answering={answering}
        onGoToQuestion={goToQuestion}
        onStopAnswering={stopAnswer}
        questions={questions}
      />
    ) : null;
  const submit = useCallback<QuestionAnswering['submit']>(
    async (value) => {
      const answer = questionAnswerFromComposer(answering, sessionId, value);
      if (answer?.kind === 'response') await respond(answer.interaction, answer.response);
      else if (answer) await send({ ...value, answersQuestionId: answer.questionId });
      else {
        const revision = planRevisionFromComposer(interactions, value);
        await (revision ? respond(revision.interaction, revision.response) : send(value));
      }
      if (answer) stopAnswer();
    },
    [answering, interactions, respond, send, sessionId, stopAnswer],
  );
  return { context, notice, submit };
}
