import { describe, expect, it } from 'vitest';
import type { UserQuestion } from '@clio/core';
import {
  answerBodyForQuestion,
  shouldShowQuestionSource,
  userQuestionOptionValue,
  userQuestionOptions,
} from '../../src/components/UserQuestionCardModel.js';

function question(overrides: Partial<UserQuestion>): UserQuestion {
  return {
    id: 'q1',
    prompt: 'Pick one',
    kind: 'freeform',
    ...overrides,
  } as UserQuestion;
}

describe('UserQuestionCardModel', () => {
  it('normalizes missing options to an empty list', () => {
    expect(userQuestionOptions(question({ options: undefined }))).toEqual([]);
  });

  it('uses option value when present and label otherwise', () => {
    expect(userQuestionOptionValue({ label: 'Fast', value: 'fast' })).toBe(
      'fast',
    );
    expect(userQuestionOptionValue({ label: 'Careful' })).toBe('Careful');
  });

  it('builds trimmed freeform answer bodies', () => {
    expect(
      answerBodyForQuestion(question({ kind: 'freeform' }), {
        draft: '  yes  ',
      }),
    ).toEqual({ answer: 'yes' });
    expect(
      answerBodyForQuestion(question({ kind: 'freeform' }), { draft: '   ' }),
    ).toBeNull();
  });

  it('builds choice answer bodies from the selected option', () => {
    expect(
      answerBodyForQuestion(question({ kind: 'choice' }), {
        pickedOption: 'alpha',
      }),
    ).toEqual({ selected_options: ['alpha'] });
    expect(answerBodyForQuestion(question({ kind: 'choice' }), {})).toBeNull();
  });

  it('builds confirmation answer bodies from the selected option', () => {
    expect(
      answerBodyForQuestion(question({ kind: 'confirmation' }), {
        pickedOption: 'yes',
      }),
    ).toEqual({ answer: 'yes' });
    expect(answerBodyForQuestion(question({ kind: 'confirmation' }), {})).toBeNull();
  });

  it('shows sources only when they are external to the orchestrator', () => {
    expect(shouldShowQuestionSource(question({ source: undefined }))).toBe(false);
    expect(shouldShowQuestionSource(question({ source: 'orchestrator' }))).toBe(
      false,
    );
    expect(shouldShowQuestionSource(question({ source: 'planner' }))).toBe(true);
  });
});
