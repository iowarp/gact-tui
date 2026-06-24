/**
 * UI component: User Question Freeform Body. Exports `UserQuestionFreeformBody`.
 */
export function UserQuestionFreeformBody(props: {
  draft: string;
  submitting: boolean;
  onDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      class="uqc__body uqc__body--freeform"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <input
        type="text"
        class="uqc__input"
        placeholder="Your answer…"
        value={props.draft}
        onInput={(event) => props.onDraft(event.currentTarget.value)}
        autofocus
        data-testid="user-question-input"
      />
      <button
        type="submit"
        class="uqc__send"
        disabled={props.submitting || !props.draft.trim()}
        data-testid="user-question-send"
      >
        {props.submitting ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
