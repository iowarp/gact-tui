import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { embedsQuestionSurface } from '@/lib/a2ui/question-navigation';
import { AskButton, AskError, AskOptions, AskSubject } from './ask-card';
import { respondFromControl } from './interaction-control';
import { useComposerAnswer } from './question-card-model';
import { useQuestionDraftValue } from './question-answer-context';
import { QuestionBundleResponse } from './question-bundle-response';
import { bundleQuestions } from './question-bundle';
import { QuestionChoiceRows, QuestionWriteIn } from './question-choice-card';
import { StructuredQuestionResponse, UrlConsentResponse } from './question-interaction-forms';
import { QuestionResponseFrame, type QuestionFrameCard } from './question-response-frame';
import { QuestionSurface } from './question-surface';
import { SurfaceQuestionNotice } from './surface-question-notice';

const QUESTION_ACTIONS = new Set(['answer', 'cancel']);

/**
 * One question on the ask card. A single choice answers on click or its
 * number; several choices are checked and submitted together; a written
 * answer goes in the card's field, or in the composer when it can carry it.
 */
export function QuestionResponse(props: {
  interaction: PendingInteraction;
  disabled?: boolean;
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
  showFullPrompt?: boolean;
  card?: QuestionFrameCard;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const { interaction, disabled, onResponse, responseError } = props;
  const [answer, setAnswer] = useQuestionDraftValue(interaction.id, 'answer', '');
  const [multiSelection, setMultiSelection] = useQuestionDraftValue(
    interaction.id,
    'multiSelection',
    [],
  );
  const composer = useComposerAnswer(interaction);
  if (bundleQuestions(interaction).length) return <QuestionBundleResponse {...props} />;
  if (interaction.source.surface_id && !embedsQuestionSurface(interaction))
    return <SurfaceQuestionNotice {...props} />;
  if (interaction.payload?.mode === 'url') return <UrlConsentResponse {...props} />;
  if (interaction.payload?.mode === 'form' && interaction.payload.fields?.length)
    return <StructuredQuestionResponse {...props} />;

  const choices = (interaction.payload?.options ?? []).map((option) => ({
    value: option.value || option.label,
    label: option.label,
    description: option.description,
  }));
  const multi = interaction.payload?.question_kind === 'multi_choice';
  const actions = interaction.actions ?? [];
  const canAnswer = actions.includes('answer');
  const allowsWriting = choices.length === 0 || interaction.payload?.allow_freeform === true;
  const writesHere = allowsWriting && (choices.length === 0 || !composer.available);
  const unknown = actions.filter((action) => !QUESTION_ACTIONS.has(action));
  const respond = (response: PendingInteractionResponse) =>
    respondFromControl(onResponse(interaction, response));
  const label = interaction.prompt ?? interaction.title;
  return (
    <QuestionResponseFrame {...props} allowsComposer={allowsWriting && choices.length > 0}>
      <QuestionSurface interaction={interaction} />
      <AskError error={responseError} />
      {!canAnswer ? (
        <AskSubject>Input controls are not available yet.</AskSubject>
      ) : choices.length ? (
        <QuestionChoiceRows
          choices={choices}
          disabled={disabled}
          label={label}
          mode={multi ? 'multi' : 'answer'}
          onChoose={(value) =>
            multi
              ? setMultiSelection((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value],
                )
              : respond({ action: 'answer', selected_options: [value] })
          }
          selected={multiSelection}
        />
      ) : null}
      {canAnswer && writesHere ? (
        <QuestionWriteIn
          disabled={disabled}
          enterKey={choices.length === 0}
          id={`${interaction.id}-answer`}
          onChange={setAnswer}
          onSubmit={() => respond({ action: 'answer', answer: answer.trim() })}
          placeholder={choices.length ? 'Or type your own answer' : 'Type your answer'}
          value={answer}
        />
      ) : null}
      {(canAnswer && multi && choices.length) || unknown.length ? (
        <AskOptions aria-label="Answer">
          {canAnswer && multi && choices.length ? (
            <AskButton
              disabled={disabled || multiSelection.length === 0}
              hint="Enter"
              onClick={() => respond({ action: 'answer', selected_options: multiSelection })}
              primary
            >
              Submit
            </AskButton>
          ) : null}
          {unknown.map((action) => (
            <AskButton disabled key={action} title={`This client cannot offer "${action}" yet.`}>
              {action}
            </AskButton>
          ))}
        </AskOptions>
      ) : null}
    </QuestionResponseFrame>
  );
}
