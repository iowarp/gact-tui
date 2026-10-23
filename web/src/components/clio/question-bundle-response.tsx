import { useAttentionDraft } from './attention-drafts';
import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { QuestionResponseFrame } from './question-response-frame';
import { QuestionChoiceCard } from './question-choice-card';
import { ResponseErrorNotice } from './pending-interaction-notices';

import { bundleQuestions, type BundleQuestion } from './question-bundle';

interface BundleAnswer {
  answer: string;
  selected_options: string[];
  other?: boolean;
  comments?: Record<string, string>;
  freeform?: string;
}
const emptyAnswer: BundleAnswer = { answer: '', selected_options: [] };

/** Keep all answers local until the user submits the complete bundle once. */
export function QuestionBundleResponse(props: {
  interaction: PendingInteraction;
  disabled?: boolean;
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
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
  const selection = value.selected_options[0] ?? (value.other || value.answer ? otherValue : '');
  const setValue = (value: BundleAnswer) =>
    setAnswers((answers) => ({ ...answers, [question.id]: value }));
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
  return (
    <QuestionResponseFrame
      {...props}
      disabled={disabled}
      questionTitle={question.question}
      progress={
        <span role="status">
          Question {index + 1} of {questions.length}
        </span>
      }
    >
      <fieldset
        disabled={disabled}
        className="clio-scrollbar max-h-[min(24rem,35dvh)] min-w-0 overflow-y-auto p-0.5"
      >
        <legend className="sr-only">{question.question}</legend>
        {question.options.length ? (
          <RadioGroup
            aria-label={question.question}
            className="gap-2"
            value={selection}
            onValueChange={(next) =>
              setValue({
                ...value,
                answer:
                  next === otherValue ? (value.freeform ?? '') : (value.comments?.[next] ?? ''),
                selected_options: next === otherValue ? [] : [next],
                other: next === otherValue,
              })
            }
          >
            {question.options.map((option, i) => (
              <QuestionChoiceCard
                key={`${question.id}-${option.value}`}
                id={`${props.interaction.id}-${question.id}-${i}`}
                label={option.label}
                description={option.description}
                selected={selection === option.value}
                disabled={disabled}
                control={
                  <RadioGroupItem
                    aria-label={option.label}
                    id={`${props.interaction.id}-${question.id}-${i}`}
                    value={option.value}
                  />
                }
                comment={value.comments?.[option.value] ?? ''}
                onCommentOpen={() =>
                  setValue({
                    ...value,
                    selected_options: [option.value],
                    answer: value.comments?.[option.value] ?? '',
                    other: false,
                  })
                }
                onCommentChange={(text) =>
                  setValue({
                    ...value,
                    answer: text,
                    comments: { ...value.comments, [option.value]: text },
                  })
                }
              />
            ))}
            {question.allow_freeform ? (
              <QuestionChoiceCard
                id={`${props.interaction.id}-${question.id}-other`}
                label="Other answer"
                selected={selection === otherValue}
                disabled={disabled}
                control={
                  <RadioGroupItem
                    aria-label="Other answer"
                    id={`${props.interaction.id}-${question.id}-other`}
                    value={otherValue}
                  />
                }
              />
            ) : null}
          </RadioGroup>
        ) : null}
        {!question.options.length || (question.allow_freeform && selection === otherValue) ? (
          <Textarea
            aria-label={question.question}
            className="mt-2 min-h-20"
            value={value.answer}
            onChange={(event) =>
              setValue({
                ...value,
                answer: event.target.value,
                freeform: event.target.value,
                selected_options: [],
                other: true,
              })
            }
          />
        ) : null}
      </fieldset>
      <ResponseErrorNotice error={props.responseError} />
      <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Back
        </Button>
        {index < questions.length - 1 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setIndex(index + 1)}
          >
            Next question
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={disabled || complete !== questions.length}
            onClick={() => void submit()}
          >
            {sending ? 'Sending…' : 'Submit all answers'}
          </Button>
        )}
      </div>
    </QuestionResponseFrame>
  );
}
