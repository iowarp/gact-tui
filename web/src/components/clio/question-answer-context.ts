import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { createContext, useContext } from 'react';

/**
 * "This question is being answered in the main composer": the inline question
 * card's "Other answer" starts it, the notice over the composer shows it, and
 * the composer's submit routes the next message to that question.
 */
export interface QuestionAnswerState {
  /** The interaction id of the question the composer's next message answers. */
  answeringId?: string;
  openQuestion?: (interaction: PendingInteraction) => void;
  surfaces?: Readonly<Record<string, A2UISurface>>;
  refetchSurfaces?: () => void;
  startAnswer: (interactionId: string) => void;
  stopAnswer: () => void;
}

export const QuestionAnswerContext = createContext<QuestionAnswerState | undefined>(undefined);

/** The composer-answer state, or `undefined` outside a workspace conversation. */
export function useQuestionAnswer(): QuestionAnswerState | undefined {
  return useContext(QuestionAnswerContext);
}
