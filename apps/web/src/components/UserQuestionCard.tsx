import { createSignal, For, Show } from 'solid-js';
import type { UserQuestion, UserQuestionOption } from '@clio/core';
import { Icon } from './Icon.js';
import './user-question-card.css';

export interface UserQuestionCardProps {
  question: UserQuestion;
  onAnswer: (body: { answer?: string; selected_options?: string[] }) => void | Promise<void>;
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

  function options(): UserQuestionOption[] {
    return props.question.options ?? [];
  }

  async function submit() {
    if (submitting()) return;
    const kind = props.question.kind;
    let body: { answer?: string; selected_options?: string[] } = {};
    if (kind === 'choice') {
      const picked = pickedOption();
      if (!picked) return;
      body = { selected_options: [picked] };
    } else if (kind === 'confirmation') {
      const picked = pickedOption();
      if (!picked) return;
      body = { answer: picked };
    } else {
      const t = draft().trim();
      if (!t) return;
      body = { answer: t };
    }
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
      aria-label="Question from CLIO"
      data-testid={`user-question-${props.question.id}`}
    >
      <div class="uqc__head">
        <span class="uqc__icon" aria-hidden>
          <Icon name="help" size={16} />
        </span>
        <div class="uqc__head-text">
          <div class="uqc__eyebrow">CLIO needs an answer to continue</div>
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
        <form
          class="uqc__body uqc__body--freeform"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="text"
            class="uqc__input"
            placeholder="Your answer…"
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            autofocus
            data-testid="user-question-input"
          />
          <button
            type="submit"
            class="uqc__send"
            disabled={submitting() || !draft().trim()}
            data-testid="user-question-send"
          >
            {submitting() ? 'Sending…' : 'Send'}
          </button>
        </form>
      </Show>

      <Show when={props.question.kind === 'choice'}>
        <ul class="uqc__body uqc__body--choices" role="radiogroup">
          <For each={options()}>
            {(opt) => {
              const value = opt.value ?? opt.label;
              return (
                <li>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pickedOption() === value}
                    class={
                      'uqc__choice ' +
                      (pickedOption() === value ? 'is-picked' : '')
                    }
                    onClick={() => setPickedOption(value)}
                    data-testid={`user-question-choice-${value}`}
                  >
                    <span class="uqc__choice-label">{opt.label}</span>
                    <Show when={opt.description}>
                      <span class="uqc__choice-desc">{opt.description}</span>
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
            disabled={submitting() || !pickedOption()}
            onClick={() => void submit()}
            data-testid="user-question-send"
          >
            {submitting() ? 'Sending…' : 'Send choice'}
          </button>
        </div>
      </Show>

      <Show when={props.question.kind === 'confirmation'}>
        <div class="uqc__body uqc__body--confirmation">
          <button
            type="button"
            class="uqc__yesno uqc__yesno--yes"
            onClick={() => {
              setPickedOption('yes');
              void props.onAnswer({ answer: 'yes' });
            }}
            disabled={submitting()}
            data-testid="user-question-yes"
          >
            <Icon name="check" size={14} /> Yes
          </button>
          <button
            type="button"
            class="uqc__yesno uqc__yesno--no"
            onClick={() => {
              setPickedOption('no');
              void props.onAnswer({ answer: 'no' });
            }}
            disabled={submitting()}
            data-testid="user-question-no"
          >
            <Icon name="close" size={14} /> No
          </button>
        </div>
      </Show>

      <Show when={props.question.source && props.question.source !== 'orchestrator'}>
        <div class="uqc__source">from: {props.question.source}</div>
      </Show>
    </div>
  );
}
