import { useAttentionDraft } from './attention-drafts';
import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { QuestionResponseFrame } from './question-response-frame';
import { QuestionMarkdown } from './question-markdown';
import { ResponseErrorNotice } from './pending-interaction-notices';

import { bundleQuestions, type BundleQuestion } from './question-bundle';

interface BundleAnswer {
  answer: string;
  selected_options: string[];
  other?: boolean;
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
    <QuestionResponseFrame {...props} disabled={disabled}>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span>{complete} answered · submitted together</span>
      </div>
      <fieldset disabled={disabled} className="min-w-0">
        <legend className="mb-3 text-sm font-medium">
          <QuestionMarkdown>{question.question}</QuestionMarkdown>
        </legend>
        {question.options.length ? (
          <RadioGroup
            aria-label={question.question}
            value={selection}
            onValueChange={(next) =>
              setValue({
                answer: next === otherValue ? value.answer : '',
                selected_options: next === otherValue ? [] : [next],
                other: next === otherValue,
              })
            }
          >
            {question.options.map((option, i) => (
              <Label
                key={option.value}
                htmlFor={`${props.interaction.id}-${question.id}-${i}`}
                className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted/50"
              >
                <RadioGroupItem
                  id={`${props.interaction.id}-${question.id}-${i}`}
                  value={option.value}
                />
                <span className="min-w-0">
                  <span className="block text-sm">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </Label>
            ))}
            {question.allow_freeform ? (
              <Label
                className="flex items-center gap-2.5 px-2 py-2"
                htmlFor={`${props.interaction.id}-${question.id}-other`}
              >
                <RadioGroupItem
                  id={`${props.interaction.id}-${question.id}-other`}
                  value={otherValue}
                />
                Other answer
              </Label>
            ) : null}
          </RadioGroup>
        ) : null}
        {!question.options.length || (question.allow_freeform && selection === otherValue) ? (
          <Textarea
            aria-label={question.question}
            className="mt-2 min-h-20"
            value={value.answer}
            onChange={(event) =>
              setValue({ answer: event.target.value, selected_options: [], other: true })
            }
          />
        ) : null}
      </fieldset>
      <ResponseErrorNotice error={props.responseError} />
      <div className="mt-4 flex items-center justify-between gap-2">
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
