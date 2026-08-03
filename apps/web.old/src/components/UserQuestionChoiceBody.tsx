/**
 * UI component: User Question Choice Body. Exports `UserQuestionChoiceBody`.
 */
import { For, Show } from 'solid-js';
import type { UserQuestion } from '@clio/core';
import {
  userQuestionOptions,
  userQuestionOptionValue,
} from './UserQuestionCardModel.js';

export function UserQuestionChoiceBody(props: {
  question: UserQuestion;
  pickedOption: string | null;
  submitting: boolean;
  onPick: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <ul class="uqc__body uqc__body--choices" role="radiogroup">
        <For each={userQuestionOptions(props.question)}>
          {(option) => {
            const value = userQuestionOptionValue(option);
            const picked = () => props.pickedOption === value;
            return (
              <li>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked()}
                  class={'uqc__choice ' + (picked() ? 'is-picked' : '')}
                  onClick={() => props.onPick(value)}
                  data-testid={`user-question-choice-${value}`}
                >
                  <span class="uqc__choice-label">{option.label}</span>
                  <Show when={option.description}>
                    <span class="uqc__choice-desc">{option.description}</span>
                  </Show>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
      <div class="uqc__actions">
        <button
          type="button"
          class="uqc__send"
          disabled={props.submitting || !props.pickedOption}
          onClick={props.onSubmit}
          data-testid="user-question-send"
        >
          {props.submitting ? 'Sending…' : 'Send choice'}
        </button>
      </div>
    </>
  );
}
