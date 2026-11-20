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
import { isVariantPickInteraction } from '@/lib/variant-runs';
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
   * (text through its route, attachments as the answering message), else typed
   * text answers the one ask_user question the turn waits on, plan feedback
   * while a plan review waits, or an ordinary message.
   */
  submit: (value: SessionSendInput) => Promise<void>;
}

/**
 * The workspace's agent-question wiring: which pending questions sit in the
 * log, which one the composer is answering, and the notice that links to
 * them. A pending question never blocks the composer. Typed text answers the
 * question the turn waits on, and a message is still sent as a message while
 * no such question (or more than one) is open.
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
  // Read the live row: a question answered or expired elsewhere stops being a
  // target. A pick between drafts never is: it is answered in its tabs block.
  const typedAnswerTarget = (question: PendingInteraction) =>
    question.kind === 'question' &&
    question.source.protocol === 'native' &&
    !question.payload?.mode &&
    question.status === 'pending' &&
    question.requires_human_response !== false &&
    question.source.tool_name !== 'plan_exit' &&
    !isVariantPickInteraction(question);
  const answering = interactions.find(
    (question) => question.id === answeringId && typedAnswerTarget(question),
  );
  // With none picked, the one ask_user question the turn is blocked on takes the
  // typed text: the agent reads it as the answer, so the card must close with it,
  // whatever other cards (consents, plan reviews) wait beside it. Every service
  // question reports `response_mode: "async"`, so that is no sign it isn't blocking.
  const blockingQuestions = questions.filter(typedAnswerTarget);
  const implicitTarget = blockingQuestions.length === 1 ? blockingQuestions[0] : undefined;
  const stopAnswer = useCallback(() => setAnsweringId(undefined), []);
  const context = useMemo<QuestionAnswerState>(
    () => ({
      answeringId: answering?.id,
      startAnswer: (interactionId) => {
        setAnsweringId(interactionId);
        focusComposer();
      },
      stopAnswer,
      questionLink: (question) => questionLink(messages, question),
    }),
    [answering?.id, focusComposer, messages, stopAnswer],
  );
  const goToQuestion = useCallback(
    (question: PendingInteraction) => {
      const link = questionLink(messages, question);
      if (link) followTranscriptLink(link);
    },
    [messages],
  );
  const notice =
    answering || questions.some((row) => !row.payload?.response_mode) ? (
      <PendingQuestionNotice
        answering={answering}
        onGoToQuestion={goToQuestion}
        onStopAnswering={stopAnswer}
        questions={questions}
      />
    ) : null;
  const submit = useCallback<QuestionAnswering['submit']>(
    async (value) => {
      // Attachments answer only a question picked with "Other answer"; unpicked,
      // they are sent as a message.
      const attached = (value.files?.length ?? 0) > 0 || (value.references?.length ?? 0) > 0;
      const target = answering ?? (attached ? undefined : implicitTarget);
      const answer = questionAnswerFromComposer(target, sessionId, value);
      if (answer?.kind === 'response') await respond(answer.interaction, answer.response);
      else if (answer) {
        const asyncTarget = target?.payload?.response_mode === 'async' && !target.payload.task_handle;
        await send({
          ...value,
          // The queued route refuses an answer (answers_question_id), so a busy
          // composer's queued answer goes through the message route instead.
          ...(asyncTarget
            ? { delivery: 'queued' as const }
            : value.delivery === 'queued' && !target?.payload?.task_handle
              ? { delivery: 'auto' as const }
              : {}),
          answersQuestionId: answer.questionId,
          ...(target?.payload?.task_handle ? { answersQuestionTask: true } : {}),
        });
      } else {
        const revision = planRevisionFromComposer(interactions, value);
        await (revision ? respond(revision.interaction, revision.response) : send(value));
      }
      if (answer) stopAnswer();
    },
    [answering, implicitTarget, interactions, respond, send, sessionId, stopAnswer],
  );
  return { context, notice, submit };
}
