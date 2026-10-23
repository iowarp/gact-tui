import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { respondFromControl } from './interaction-control';
import { QuestionResponseFrame } from './question-response-frame';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { QuestionSurface } from './question-surface';
import { StructuredQuestionResponse, UrlConsentResponse } from './question-interaction-forms';
import { useQuestionDraftValue } from './question-answer-context';
import { embedsQuestionSurface } from '@/lib/a2ui/question-navigation';
import { SurfaceQuestionNotice } from './surface-question-notice';
import { QuestionBundleResponse } from './question-bundle-response';
import { bundleQuestions } from './question-bundle';
import { QuestionChoiceCard } from './question-choice-card';

/** Native questions keep their durable drafts and existing response owners. */
export function QuestionResponse(props: {
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
  const { interaction, disabled, onResponse, responseError } = props;
  const [answer, setAnswer] = useQuestionDraftValue(interaction.id, 'answer', '');
  const [selection, setSelection] = useQuestionDraftValue(interaction.id, 'selection', '');
  const [multiSelection, setMultiSelection] = useQuestionDraftValue(
    interaction.id,
    'multiSelection',
    [],
  );
  const [optionComments, setOptionComments] = useQuestionDraftValue(
    interaction.id,
    'optionComments',
    {},
  );
  if (bundleQuestions(interaction).length) return <QuestionBundleResponse {...props} />;
  if (interaction.source.surface_id && !embedsQuestionSurface(interaction))
    return <SurfaceQuestionNotice {...props} />;
  if (interaction.payload?.mode === 'url') return <UrlConsentResponse {...props} />;
  if (interaction.payload?.mode === 'form' && interaction.payload.fields?.length)
    return <StructuredQuestionResponse {...props} />;

  const options = interaction.payload?.options ?? [];
  const usesOptions = options.length > 0;
  const usesMulti = interaction.payload?.question_kind === 'multi_choice';
  const allowsFreeform = interaction.payload?.allow_freeform === true;
  const freeformValue = `${interaction.id}:freeform`;
  const usesFreeform = !usesOptions || selection === freeformValue;
  const canAnswer = (interaction.actions ?? []).includes('answer');
  const canSubmit =
    canAnswer &&
    (usesMulti
      ? multiSelection.length > 0
      : usesOptions
        ? Boolean(selection) && (!usesFreeform || Boolean(answer.trim()))
        : Boolean(answer.trim()));
  const selectedComment = optionComments[selection]?.trim() ?? '';
  const chooseMulti = (value: string, selected: boolean) =>
    setMultiSelection((current) =>
      selected ? [...new Set([...current, value])] : current.filter((item) => item !== value),
    );
  const choiceCards = options.map((option, index) => {
    const value = option.value || option.label;
    const selected = usesMulti ? multiSelection.includes(value) : selection === value;
    const id = `${interaction.id}-choice-${index}`;
    return (
      <QuestionChoiceCard
        key={value}
        id={id}
        label={option.label}
        description={option.description}
        selected={selected}
        disabled={disabled}
        control={
          usesMulti ? (
            <Checkbox
              aria-label={option.label}
              checked={selected}
              disabled={disabled}
              id={id}
              onCheckedChange={(next) => chooseMulti(value, next === true)}
            />
          ) : (
            <RadioGroupItem aria-label={option.label} id={id} value={value} />
          )
        }
        comment={optionComments[value] ?? ''}
        onCommentOpen={() => (usesMulti ? chooseMulti(value, true) : setSelection(value))}
        onCommentChange={(text) => setOptionComments((current) => ({ ...current, [value]: text }))}
      />
    );
  });
  return (
    <QuestionResponseFrame {...props}>
      <ResponseErrorNotice error={responseError} />
      <QuestionSurface interaction={interaction} />
      {!canAnswer ? (
        <p className="text-sm text-muted-foreground">Input controls are not available yet.</p>
      ) : usesMulti ? (
        <div
          className="clio-scrollbar grid max-h-[min(24rem,35dvh)] gap-2 overflow-y-auto p-0.5"
          data-slot="checkbox-group"
        >
          {choiceCards}
        </div>
      ) : usesOptions ? (
        <RadioGroup
          className="clio-scrollbar max-h-[min(24rem,35dvh)] gap-2 overflow-y-auto p-0.5"
          disabled={disabled}
          onValueChange={setSelection}
          value={selection}
        >
          {choiceCards}
          {allowsFreeform ? (
            <QuestionChoiceCard
              id={`${interaction.id}-freeform`}
              label="Something else"
              selected={selection === freeformValue}
              disabled={disabled}
              control={
                <RadioGroupItem
                  aria-label="Something else"
                  id={`${interaction.id}-freeform`}
                  value={freeformValue}
                />
              }
            >
              {selection === freeformValue ? (
                <div className="grid min-w-0 gap-1.5 px-3.5 pb-3 sm:pl-10">
                  <FieldLabel htmlFor={`${interaction.id}-answer`}>Your response</FieldLabel>
                  <Textarea
                    className="min-h-16 resize-y field-sizing-fixed"
                    rows={2}
                    disabled={disabled}
                    id={`${interaction.id}-answer`}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Type your response"
                    value={answer}
                  />
                </div>
              ) : null}
            </QuestionChoiceCard>
          ) : null}
        </RadioGroup>
      ) : (
        <div className="grid min-w-0 gap-2">
          <FieldLabel htmlFor={`${interaction.id}-answer`}>Your response</FieldLabel>
          <Textarea
            className="block min-h-20 w-full min-w-0 resize-y field-sizing-fixed"
            rows={3}
            disabled={disabled}
            id={`${interaction.id}-answer`}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Type your response"
            value={answer}
          />
        </div>
      )}
      {canAnswer ? (
        <div className="mt-4 flex justify-end border-t pt-3">
          <Button
            size="sm"
            disabled={disabled || !canSubmit}
            onClick={() =>
              respondFromControl(
                onResponse(
                  interaction,
                  usesMulti
                    ? {
                        action: 'answer',
                        selected_options: multiSelection,
                        metadata: {
                          option_comments: Object.fromEntries(
                            multiSelection
                              .map((value) => [value, optionComments[value]?.trim()] as const)
                              .filter((entry) => Boolean(entry[1])),
                          ),
                        },
                      }
                    : usesOptions && !usesFreeform
                      ? {
                          action: 'answer',
                          selected_options: [selection],
                          ...(selectedComment ? { answer: selectedComment } : {}),
                        }
                      : { action: 'answer', answer: answer.trim() },
                ),
              )
            }
          >
            Send response
          </Button>
        </div>
      ) : null}
    </QuestionResponseFrame>
  );
}
