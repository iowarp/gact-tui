/**
 * View-model / pure logic for User Question Card: state shaping and helpers, no DOM. Key export `UserQuestionAnswerBody`.
 */
import type { UserQuestion, UserQuestionOption } from '@clio/core';

export type UserQuestionAnswerBody = {
  answer?: string;
  selected_options?: string[];
};

export function userQuestionOptions(question: UserQuestion): UserQuestionOption[] {
  return question.options ?? [];
}

export function userQuestionOptionValue(option: UserQuestionOption): string {
  return option.value ?? option.label;
}

export function answerBodyForQuestion(
  question: UserQuestion,
  input: { draft?: string; pickedOption?: string | null },
): UserQuestionAnswerBody | null {
  if (question.kind === 'choice') {
    if (!input.pickedOption) return null;
    return { selected_options: [input.pickedOption] };
  }
  if (question.kind === 'confirmation') {
    if (!input.pickedOption) return null;
    return { answer: input.pickedOption };
  }
  const answer = input.draft?.trim() ?? '';
  if (!answer) return null;
  return { answer };
}

export function shouldShowQuestionSource(question: UserQuestion): boolean {
  return !!question.source && question.source !== 'orchestrator';
}
