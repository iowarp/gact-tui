/**
 * UI component: User Question Card. Renders `UserQuestionCard` from `UserQuestionCardProps`.
 */
import { createSignal, Show } from 'solid-js';
import { brand } from '@brand';
import type { UserQuestion } from '@clio/core';
import { Icon } from './Icon.js';
import { UserQuestionChoiceBody } from './UserQuestionChoiceBody.js';
import { UserQuestionConfirmationBody } from './UserQuestionConfirmationBody.js';
import { UserQuestionFreeformBody } from './UserQuestionFreeformBody.js';
import {
  answerBodyForQuestion,
  shouldShowQuestionSource,
  type UserQuestionAnswerBody,
} from './UserQuestionCardModel.js';
import './user-question-card.css';

export interface UserQuestionCardProps {
  question: UserQuestion;
  onAnswer: (body: UserQuestionAnswerBody) => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

/**
 * Inline card rendered in the transcript when the orchestrator
 * pauses for clarification (clio-agent PRs #342 / #380). Renders one
 * of three shapes:
 *
 * - `freeform` — single text input, submit by Enter or Send button
 * - `choice` — radio-style list of options, single pick
 * - `confirmation` — Yes / No pair
 *
 * Cancelling abandons the turn (the orchestrator falls through to
 * its retry path). Submitting drives the answer back to the backend
 * which resumes the held turn.
 */
export function UserQuestionCard(props: UserQuestionCardProps) {
  const [draft, setDraft] = createSignal('');
  const [pickedOption, setPickedOption] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);

  async function submit() {
    if (submitting()) return;
    const body = answerBodyForQuestion(props.question, {
      draft: draft(),
      pickedOption: pickedOption(),
    });
    if (!body) return;
    setSubmitting(true);
    try {
      await props.onAnswer(body);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      class="uqc"
      role="dialog"
      aria-label={`Question from ${brand.name}`}
      data-testid={`user-question-${props.question.id}`}
    >
      <div class="uqc__head">
        <span class="uqc__icon" aria-hidden>
          <Icon name="help" size={16} />
        </span>
        <div class="uqc__head-text">
          <div class="uqc__eyebrow">{brand.name} needs an answer to continue</div>
          <div class="uqc__prompt">{props.question.prompt}</div>
        </div>
        <button
          type="button"
          class="uqc__cancel-x"
          onClick={() => void props.onCancel()}
          disabled={submitting()}
          title="Cancel — abandon this turn"
          aria-label="Cancel question"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <Show when={props.question.kind === 'freeform'}>
        <UserQuestionFreeformBody
          draft={draft()}
          submitting={submitting()}
          onDraft={setDraft}
          onSubmit={() => void submit()}
        />
      </Show>

      <Show when={props.question.kind === 'choice'}>
        <UserQuestionChoiceBody
          question={props.question}
          pickedOption={pickedOption()}
          submitting={submitting()}
          onPick={setPickedOption}
          onSubmit={() => void submit()}
        />
      </Show>

      <Show when={props.question.kind === 'confirmation'}>
        <UserQuestionConfirmationBody
          submitting={submitting()}
          onAnswer={(answer) => {
            setPickedOption(answer);
            void props.onAnswer({ answer });
          }}
        />
      </Show>

      <Show when={shouldShowQuestionSource(props.question)}>
        <div class="uqc__source">from: {props.question.source}</div>
      </Show>
    </div>
  );
}
