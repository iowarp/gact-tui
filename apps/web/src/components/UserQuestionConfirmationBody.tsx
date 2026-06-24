/**
 * UI component: User Question Confirmation Body. Exports `UserQuestionConfirmationBody`.
 */
import { Icon } from './Icon.js';

export function UserQuestionConfirmationBody(props: {
  submitting: boolean;
  onAnswer: (answer: 'yes' | 'no') => void;
}) {
  return (
    <div class="uqc__body uqc__body--confirmation">
      <button
        type="button"
        class="uqc__yesno uqc__yesno--yes"
        onClick={() => props.onAnswer('yes')}
        disabled={props.submitting}
        data-testid="user-question-yes"
      >
        <Icon name="check" size={14} /> Yes
      </button>
      <button
        type="button"
        class="uqc__yesno uqc__yesno--no"
        onClick={() => props.onAnswer('no')}
        disabled={props.submitting}
        data-testid="user-question-no"
      >
        <Icon name="close" size={14} /> No
      </button>
    </div>
  );
}
