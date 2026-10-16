import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { createContext, useContext } from 'react';
import type { SurfaceQuestionTarget } from '@/lib/a2ui/question-navigation';

/**
 * "This question is being answered in the main composer": the inline question
 * card's "Other answer" starts it, the notice over the composer shows it, and
 * the composer's submit routes the next message to that question.
 */
export interface QuestionAnswerState {
  /** The workspace's live interaction inventory, shared by transcript and Work. */
  interactions?: readonly PendingInteraction[];
  /** The interaction id of the question the composer's next message answers. */
  answeringId?: string;
  openQuestion?: (interaction: PendingInteraction) => void;
  openSurfaceQuestion?: (interaction: PendingInteraction) => void;
  surfaceTarget?: SurfaceQuestionTarget;
  /** The loaded transcript location of a question, when its source is available. */
  questionLink?: (interaction: PendingInteraction) => string | undefined;
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
