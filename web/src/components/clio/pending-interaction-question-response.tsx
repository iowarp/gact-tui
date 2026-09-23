import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import { InteractionFrameHeader } from './interaction-frame-header';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { StructuredQuestionResponse, UrlConsentResponse } from './question-interaction-forms';

/**
 * Split out of `pending-interactions.tsx` purely for file size (the 800-line
 * CI ratchet, `scripts/check_frontend_file_size.mjs`) — the `question`/
 * `mcp_task_input` free-text, single-choice, and multi-choice response card.
 */
export function QuestionResponse({
  interaction,
  disabled,
  onResponse,
  ownerLabel,
  responseError,
  showOwner,
}: {
  interaction: PendingInteraction;
  disabled?: boolean;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
}) {
  const [answer, setAnswer] = useState('');
  const [selection, setSelection] = useState('');
  const [multiSelection, setMultiSelection] = useState<string[]>([]);
  const [optionComments, setOptionComments] = useState<Record<string, string>>({});
  if (interaction.payload?.mode === 'url') {
    return (
      <UrlConsentResponse
        disabled={disabled}
        interaction={interaction}
        onResponse={onResponse}
        ownerLabel={ownerLabel}
        responseError={responseError}
        showOwner={showOwner}
      />
    );
  }
  if (interaction.payload?.mode === 'form' && interaction.payload.fields?.length) {
    return (
      <StructuredQuestionResponse
        disabled={disabled}
        interaction={interaction}
        onResponse={onResponse}
        ownerLabel={ownerLabel}
        responseError={responseError}
        showOwner={showOwner}
      />
    );
  }
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

  return (
    <Frame
      className={cn(
        'min-w-0 self-stretch',
        interaction.kind === 'mcp_task_input' && 'border-accent-foreground/15 bg-accent/25',
      )}
      data-interaction-kind={interaction.kind}
      dense
      id={pendingInteractionDomId(interaction.id)}
      spacing="sm"
      tabIndex={-1}
    >
      <InteractionFrameHeader
        disabled={disabled}
        interaction={interaction}
        onCancel={
          (interaction.actions ?? []).includes('cancel')
            ? () => respondFromControl(onResponse(interaction, { action: 'cancel' }))
            : undefined
        }
        ownerLabel={ownerLabel}
        showOwner={showOwner}
      />
      <FramePanel className="min-w-0 overflow-hidden">
        <ResponseErrorNotice error={responseError} />
        {!canAnswer ? (
          <p className="text-sm text-muted-foreground">Input controls are not available yet.</p>
        ) : usesMulti ? (
          <div className="grid gap-2" data-slot="checkbox-group">
            {options.map((option) => {
              const value = option.value || option.label;
              const selected = multiSelection.includes(value);
              return (
                <div className="rounded-lg border" key={value}>
                  <FieldLabel htmlFor={`${interaction.id}-${value}`}>
                    <Field orientation="horizontal">
                      <Checkbox
                        aria-label={option.label}
                        checked={selected}
                        disabled={disabled}
                        id={`${interaction.id}-${value}`}
                        onCheckedChange={(checked) =>
                          setMultiSelection((current) =>
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
                  {selected ? (
                    <div className="grid gap-1 border-t border-border/60 px-2.5 py-2">
                      <FieldLabel htmlFor={`${interaction.id}-${value}-comment`}>
                        Comment on {option.label} (optional)
                      </FieldLabel>
                      <Textarea
                        aria-label={`Comment on ${option.label}`}
                        className="min-h-12 resize-y field-sizing-fixed"
                        disabled={disabled}
                        id={`${interaction.id}-${value}-comment`}
                        onChange={(event) =>
                          setOptionComments((current) => ({
                            ...current,
                            [value]: event.target.value,
                          }))
                        }
                        rows={2}
                        value={optionComments[value] ?? ''}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : usesOptions ? (
          <RadioGroup disabled={disabled} onValueChange={setSelection} value={selection}>
            {options.map((option) => {
              const value = option.value || option.label;
              const selected = selection === value;
              return (
                <div
                  className={cn(
                    'rounded-lg border transition-colors hover:bg-muted/50',
                    selected &&
                      'border-primary/30 bg-primary/5 dark:border-primary/20 dark:bg-primary/10',
                  )}
                  key={value}
                >
                  <FieldLabel
                    className="has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border-0 has-[>[data-slot=field]]:hover:bg-transparent has-data-checked:bg-transparent dark:has-data-checked:bg-transparent"
                    htmlFor={`${interaction.id}-${value}`}
                  >
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        aria-label={option.label}
                        id={`${interaction.id}-${value}`}
                        value={value}
                      />
                      <FieldContent>
                        <FieldTitle>{option.label}</FieldTitle>
                        {option.description ? (
                          <FieldDescription>{option.description}</FieldDescription>
                        ) : null}
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                  {selected ? (
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 border-t border-border/60 px-2.5 py-2">
                      <FieldLabel
                        className="w-auto text-xs font-normal text-muted-foreground"
                        htmlFor={`${interaction.id}-${value}-comment`}
                      >
                        Comment on {option.label} (optional)
                      </FieldLabel>
                      <Textarea
                        aria-label={`Comment on ${option.label}`}
                        className="min-h-12 w-full resize-y field-sizing-fixed bg-background/60"
                        disabled={disabled}
                        id={`${interaction.id}-${value}-comment`}
                        onChange={(event) =>
                          setOptionComments((current) => ({
                            ...current,
                            [value]: event.target.value,
                          }))
                        }
                        placeholder="Add context for the agent"
                        rows={2}
                        value={optionComments[value] ?? ''}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {allowsFreeform ? (
              <div
                className={cn(
                  'rounded-lg border transition-colors hover:bg-muted/50',
                  selection === freeformValue &&
                    'border-primary/30 bg-primary/5 dark:border-primary/20 dark:bg-primary/10',
                )}
              >
                <FieldLabel htmlFor={`${interaction.id}-freeform`}>
                  <Field orientation="horizontal">
                    <RadioGroupItem
                      aria-label="Something else"
                      id={`${interaction.id}-freeform`}
                      value={freeformValue}
                    />
                    <FieldContent>
                      <FieldTitle>Something else</FieldTitle>
                      <FieldDescription>Provide a different answer.</FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
                {selection === freeformValue ? (
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 border-t border-border/60 px-2.5 py-2">
                    <FieldLabel htmlFor={`${interaction.id}-answer`}>Your response</FieldLabel>
                    <Textarea
                      className="w-full resize-y field-sizing-fixed"
                      disabled={disabled}
                      id={`${interaction.id}-answer`}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Type your response"
                      value={answer}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </RadioGroup>
        ) : (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
            <FieldLabel htmlFor={`${interaction.id}-answer`}>Your response</FieldLabel>
            <Textarea
              className="block w-full min-w-0 resize-y field-sizing-fixed"
              id={`${interaction.id}-answer`}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Type your response"
              value={answer}
            />
          </div>
        )}
        {canAnswer ? (
          <div className="mt-4 flex justify-end">
            <Button
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
      </FramePanel>
    </Frame>
  );
}
