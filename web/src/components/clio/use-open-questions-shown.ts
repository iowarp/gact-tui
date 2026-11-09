import type { PendingInteraction } from '@clio/core/v3';
import { useMemo } from 'react';
import { openHumanQuestions } from '@/lib/inline-question';
import { useQuestionAnswer } from './question-answer-context';

/** True when the open-questions chip shows, so the transcript reserves its lane. */
export function useOpenQuestionsShown(interactions: readonly PendingInteraction[]): boolean {
  const answer = useQuestionAnswer();
  return useMemo(
    () => Boolean(answer?.openQuestion) && openHumanQuestions(interactions).length > 0,
    [answer?.openQuestion, interactions],
  );
}
