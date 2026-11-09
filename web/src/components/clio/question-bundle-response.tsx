import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { AskButton, AskError, AskOptions } from './ask-card';
import { useAttentionDraft } from './attention-drafts';
import { bundleQuestions, type BundleQuestion } from './question-bundle';
import { QuestionChoiceRows, QuestionWriteIn } from './question-choice-card';
import { QuestionResponseFrame } from './question-response-frame';

interface BundleAnswer {
  answer: string;
  selected_options: string[];
  other?: boolean;
  freeform?: string;
}
const emptyAnswer: BundleAnswer = { answer: '', selected_options: [] };

/** Several questions asked together: one page each, answers kept until the bundle is sent once. */
export function QuestionBundleResponse(props: {
  interaction: PendingInteraction;
  disabled?: boolean;
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
  showFullPrompt?: boolean;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const questions = bundleQuestions(props.interaction);
  const [index, setIndex] = useAttentionDraft(`${props.interaction.id}:bundle-page`, 0);
  const [answers, setAnswers] = useAttentionDraft<Record<string, BundleAnswer>>(
    `${props.interaction.id}:bundle-answers`,
    () => ({}),
  );
  const [sending, setSending] = useState(false);
  const question = questions[index];
  if (!question) return null;
  const value = Object.hasOwn(answers, question.id) ? answers[question.id]! : emptyAnswer;
  const isComplete = (question: BundleQuestion) => {
    const answer = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
    return Boolean(answer && (answer.selected_options.length > 0 || answer.answer.trim()));
  };
  const complete = questions.filter(isComplete).length;
  const disabled =
    props.disabled || sending || !(props.interaction.actions ?? []).includes('answer');
  let otherValue = '__clio_other__';
  while (question.options.some((option) => option.value === otherValue)) otherValue += '_';
  const other = value.other || (!value.selected_options.length && Boolean(value.answer));
  const selection = value.selected_options[0] ?? (other ? otherValue : '');
  const setValue = (value: BundleAnswer) =>
    setAnswers((answers) => ({ ...answers, [question.id]: value }));
  const last = index === questions.length - 1;
  const submit = async () => {
    if (complete !== questions.length || disabled) return;
    setSending(true);
    try {
      await props.onResponse(props.interaction, {
        action: 'answer',
        metadata: {
          answers: Object.fromEntries(
            Object.entries(answers).map(([id, answer]) => [
              id,
              { answer: answer.answer, selected_options: answer.selected_options },
            ]),
          ),
        },
      });
    } catch {
      // The tray owns the response error; answers stay editable for a retry.
    } finally {
      setSending(false);
    }
  };
  const choices = [
    ...question.options,
    ...(question.allow_freeform && question.options.length
      ? [{ value: otherValue, label: 'Other answer' }]
      : []),
  ];
  return (
    <QuestionResponseFrame
      {...props}
      disabled={disabled}
      heading={question.question}
      meta={
        <span role="status">
          Question {index + 1} of {questions.length}
        </span>
      }
    >
      {choices.length ? (
        <QuestionChoiceRows
          choices={choices}
          disabled={disabled}
          label={question.question}
          mode="pick"
          onChoose={(next) =>
            setValue({
              ...value,
              answer: next === otherValue ? (value.freeform ?? '') : '',
              selected_options: next === otherValue ? [] : [next],
              other: next === otherValue,
            })
          }
          selected={[selection]}
        />
      ) : null}
      {!question.options.length || (question.allow_freeform && selection === otherValue) ? (
        <QuestionWriteIn
          disabled={disabled}
          label={question.question}
          onChange={(text) =>
            setValue({ ...value, answer: text, freeform: text, selected_options: [], other: true })
          }
          value={value.answer}
        />
      ) : null}
      <AskError error={props.responseError} />
      <AskOptions aria-label="Answers">
        {last ? (
          <AskButton
            disabled={disabled || complete !== questions.length}
            hint="Enter"
            onClick={() => void submit()}
            primary
          >
            {sending ? 'Sending…' : 'Submit all answers'}
          </AskButton>
        ) : (
          <AskButton disabled={disabled} hint="Enter" onClick={() => setIndex(index + 1)} primary>
            Next question
          </AskButton>
        )}
        <AskButton disabled={disabled || index === 0} onClick={() => setIndex(index - 1)}>
          Back
        </AskButton>
      </AskOptions>
    </QuestionResponseFrame>
  );
}
