import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { MessageCircleQuestionIcon } from 'lucide-react';
import { useState } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Frame, FrameHeader, FramePanel } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { CloseIcon, EditIcon } from '@/lib/icon-vocabulary';
import { inlineQuestionDomId } from '@/lib/inline-question';
import { respondFromControl } from './interaction-control';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { useQuestionAnswer } from './question-answer-context';

type Respond = (
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
) => Promise<void>;

/**
 * A pending agent question, in the log at the tool call that asked it: the
 * full question (long text scrolls inside the card), its options, and the way
 * to answer. Picking an option answers at once; "Other" hands the answer to
 * the main composer. Once answered, the same place shows the answered record.
 */
export function InlineQuestionCard({
  interaction,
  onResponse,
}: {
  interaction: PendingInteraction;
  onResponse: Respond;
}) {
  const answerState = useQuestionAnswer();
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState<Error>();
  const [picked, setPicked] = useState<string[]>([]);
  const options = interaction.payload?.options ?? [];
  const multi = interaction.payload?.question_kind === 'multi_choice';
  const canAnswer = (interaction.actions ?? []).includes('answer');
  const canCancel = (interaction.actions ?? []).includes('cancel');
  const allowsOther = options.length === 0 || interaction.payload?.allow_freeform === true;
  const answeringHere = answerState?.answeringId === interaction.id;
  const disabled = responding || !canAnswer;

  const respond = async (response: PendingInteractionResponse) => {
    if (responding) return;
    setResponding(true);
    setResponseError(undefined);
    try {
      await onResponse(interaction, response);
      if (answeringHere) answerState?.stopAnswer();
    } catch (error) {
      setResponseError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      setResponding(false);
    }
  };

  return (
    <Frame
      aria-label="Question from the agent"
      className="min-w-0 self-stretch border-action/30 bg-action/[0.04]"
      data-interaction-id={interaction.id}
      data-slot="inline-question"
      dense
      id={inlineQuestionDomId(interaction.source.invocation_id ?? interaction.id)}
      role="group"
      spacing="sm"
      tabIndex={-1}
    >
      <FrameHeader className="relative flex-row items-start gap-2 pr-10">
        <MessageCircleQuestionIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-action"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">The agent asked</p>
          <div
            className="clio-scrollbar mt-1 max-h-72 overflow-y-auto pr-1 text-sm text-foreground"
            data-slot="inline-question-prompt"
          >
            <MessageResponse>{interaction.prompt ?? interaction.title}</MessageResponse>
          </div>
        </div>
        {canCancel ? (
          <Button
            aria-label="Dismiss question"
            className="absolute right-2 top-1"
            disabled={responding}
            onClick={() => respondFromControl(respond({ action: 'cancel' }))}
            size="icon-sm"
            variant="ghost"
          >
            <CloseIcon aria-hidden="true" />
          </Button>
        ) : null}
      </FrameHeader>
      <FramePanel className="flex min-w-0 flex-col gap-2">
        <ResponseErrorNotice error={responseError} />
        {options.length > 0 && !multi ? (
          <div className="flex flex-wrap gap-2" data-slot="inline-question-options">
            {options.map((option) => (
              <Button
                className="h-auto min-h-8 max-w-full flex-col items-start gap-0 whitespace-normal py-1.5 text-left"
                disabled={disabled}
                key={option.value || option.label}
                onClick={() =>
                  respondFromControl(
                    respond({ action: 'answer', selected_options: [option.value || option.label] }),
                  )
                }
                type="button"
                variant="outline"
              >
                <span>{option.label}</span>
                {option.description ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        ) : null}
        {multi ? (
          <div className="grid gap-2" data-slot="inline-question-options">
            {options.map((option) => {
              const value = option.value || option.label;
              return (
                <FieldLabel htmlFor={`${interaction.id}-${value}`} key={value}>
                  <Field orientation="horizontal">
                    <Checkbox
                      checked={picked.includes(value)}
                      disabled={disabled}
                      id={`${interaction.id}-${value}`}
                      onCheckedChange={(checked) =>
                        setPicked((current) =>
                          checked === true
                            ? [...current, value]
                            : current.filter((item) => item !== value),
                        )
                      }
                    />
                    <FieldContent>
                      <FieldTitle>{option.label}</FieldTitle>
                      {option.description ? (
                        <FieldDescription>{option.description}</FieldDescription>
                      ) : null}
                    </FieldContent>
                  </Field>
                </FieldLabel>
              );
            })}
            <Button
              className="justify-self-start"
              disabled={disabled || picked.length === 0}
              onClick={() =>
                respondFromControl(respond({ action: 'answer', selected_options: picked }))
              }
              size="sm"
              type="button"
            >
              Send answer
            </Button>
          </div>
        ) : null}
        {allowsOther && answerState ? (
          answeringHere ? (
            <p className="text-xs text-muted-foreground" data-slot="inline-question-answering">
              Type your answer in the message box below.
            </p>
          ) : (
            <Button
              className="self-start"
              disabled={disabled}
              onClick={() => answerState.startAnswer(interaction.id)}
              size="sm"
              type="button"
              variant={options.length > 0 ? 'ghost' : 'outline'}
            >
              <EditIcon data-icon="inline-start" />
              {options.length > 0 ? 'Other answer' : 'Answer'}
            </Button>
          )
        ) : null}
      </FramePanel>
    </Frame>
  );
}
