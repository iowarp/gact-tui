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
import { PendingQuestionNotice } from './pending-question-notice';
import type { QuestionAnswerState } from './question-answer-context';

interface UseQuestionAnsweringInput {
  interactions: readonly PendingInteraction[];
  tools: readonly ToolInvocation[];
  messages: readonly Message[];
  /** Move focus to the main composer (an "Other answer" goes there). */
  focusComposer: () => void;
}

interface QuestionAnswering {
  /** The value for `QuestionAnswerContext` (read by the inline question cards). */
  context: QuestionAnswerState;
  /** The notice over the composer, or `null` when no question is waiting. */
  notice: ReactNode;
  /** The answer a composer message makes, when "Other answer" picked a question. */
  answerFromComposer: (input: {
    text: string;
    files?: readonly unknown[];
    references?: readonly unknown[];
  }) => { interaction: PendingInteraction; response: PendingInteractionResponse } | undefined;
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
  focusComposer,
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
  const answerFromComposer = useCallback<QuestionAnswering['answerFromComposer']>(
    (input) => questionAnswerFromComposer(answering, input),
    [answering],
  );
  return { context, notice, answerFromComposer };
}
