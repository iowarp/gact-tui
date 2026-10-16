import { useAttentionDraft } from './attention-drafts';
import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState, type ReactNode } from 'react';
import { MinusIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldContent, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { respondFromControl } from './interaction-control';
import { QuestionResponseFrame } from './question-response-frame';
import { ResponseErrorNotice } from './pending-interaction-notices';
import { QuestionSurface } from './question-surface';
import { QuestionMarkdown } from './question-markdown';
import { StructuredQuestionResponse, UrlConsentResponse } from './question-interaction-forms';
import { embedsQuestionSurface } from '@/lib/a2ui/question-navigation';
import { SurfaceQuestionNotice } from './surface-question-notice';
import { QuestionBundleResponse } from './question-bundle-response';
import { bundleQuestions } from './question-bundle';

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
  showFullPrompt,
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
  showFullPrompt?: boolean;
}) {
  const [answer, setAnswer] = useAttentionDraft(`${interaction.id}:answer`, '');
  const [selection, setSelection] = useAttentionDraft(`${interaction.id}:selection`, '');
  const [multiSelection, setMultiSelection] = useAttentionDraft<string[]>(
    `${interaction.id}:multi`,
    () => [],
  );
  const [optionComments, setOptionComments] = useAttentionDraft<Record<string, string>>(
    `${interaction.id}:comments`,
    () => ({}),
  );
  if (bundleQuestions(interaction).length) {
    return (
      <QuestionBundleResponse
        interaction={interaction}
        disabled={disabled}
        onResponse={onResponse}
        ownerLabel={ownerLabel}
        responseError={responseError}
        showOwner={showOwner}
      />
    );
  }
  if (interaction.source.surface_id && !embedsQuestionSurface(interaction)) {
    return (
      <SurfaceQuestionNotice
        interaction={interaction}
        disabled={disabled}
        onResponse={onResponse}
        ownerLabel={ownerLabel}
        showOwner={showOwner}
      />
    );
  }
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
    <QuestionResponseFrame
      disabled={disabled}
      interaction={interaction}
      onResponse={onResponse}
      ownerLabel={ownerLabel}
      showOwner={showOwner}
      showFullPrompt={showFullPrompt}
    >
      <ResponseErrorNotice error={responseError} />
      <QuestionSurface interaction={interaction} />
      {!canAnswer ? (
        <p className="text-sm text-muted-foreground">Input controls are not available yet.</p>
      ) : usesMulti ? (
        <div className="grid gap-1" data-slot="checkbox-group">
          {options.map((option) => {
            const value = option.value || option.label;
            const selected = multiSelection.includes(value);
            return (
              <div
                className={cn(
                  'relative rounded-md transition-colors hover:bg-muted/50',
                  selected && 'bg-primary/5',
                )}
                key={value}
              >
                <Label
                  className="flex w-full items-start gap-2 px-2 py-2"
                  htmlFor={`${interaction.id}-${value}`}
                >
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
                  <FieldContent className="min-w-0">
                    <FieldTitle className="w-full pr-8">
                      <QuestionMarkdown>{option.label}</QuestionMarkdown>
                    </FieldTitle>
                    {option.description ? (
                      <div className="text-muted-foreground">
                        <QuestionMarkdown>{option.description}</QuestionMarkdown>
                      </div>
                    ) : null}
                  </FieldContent>
                </Label>
                <QuestionComment
                  disabled={disabled}
                  label={option.label}
                  hasComment={Boolean(optionComments[value])}
                  selected={selected}
                  onOpen={() =>
                    setMultiSelection((current) =>
                      current.includes(value) ? current : [...current, value],
                    )
                  }
                >
                  <div className="grid min-w-0 gap-1 pb-2 pl-8 pr-2">
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
                      rows={2}
                      value={optionComments[value] ?? ''}
                    />
                  </div>
                </QuestionComment>
              </div>
            );
          })}
        </div>
      ) : usesOptions ? (
        <RadioGroup
          className="gap-1"
          disabled={disabled}
          onValueChange={setSelection}
          value={selection}
        >
          {options.map((option) => {
            const value = option.value || option.label;
            const selected = selection === value;
            return (
              <div
                className={cn(
                  'relative rounded-md transition-colors hover:bg-muted/50',
                  selected && 'bg-primary/5',
                )}
                key={value}
              >
                <Label
                  className="flex w-full items-start gap-2 px-2 py-2"
                  htmlFor={`${interaction.id}-${value}`}
                >
                  <RadioGroupItem
                    aria-label={option.label}
                    id={`${interaction.id}-${value}`}
                    value={value}
                  />
                  <FieldContent className="min-w-0">
                    <FieldTitle className="w-full pr-8">
                      <QuestionMarkdown>{option.label}</QuestionMarkdown>
                    </FieldTitle>
                    {option.description ? (
                      <div className="text-muted-foreground">
                        <QuestionMarkdown>{option.description}</QuestionMarkdown>
                      </div>
                    ) : null}
                  </FieldContent>
                </Label>
                <QuestionComment
                  disabled={disabled}
                  label={option.label}
                  hasComment={Boolean(optionComments[value])}
                  selected={selected}
                  onOpen={() => setSelection(value)}
                >
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 pb-2 pl-8 pr-2">
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
                </QuestionComment>
              </div>
            );
          })}
          {allowsFreeform ? (
            <div
              className={cn(
                'rounded-md transition-colors hover:bg-muted/50',
                selection === freeformValue && 'bg-primary/5',
              )}
            >
              <Label
                className="flex w-full items-start gap-2 px-2 py-2"
                htmlFor={`${interaction.id}-freeform`}
              >
                <RadioGroupItem
                  aria-label="Something else"
                  id={`${interaction.id}-freeform`}
                  value={freeformValue}
                />
                <FieldContent>
                  <FieldTitle>Something else</FieldTitle>
                </FieldContent>
              </Label>
              {selection === freeformValue ? (
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 pb-2 pl-8 pr-2">
                  <FieldLabel htmlFor={`${interaction.id}-answer`}>Your response</FieldLabel>
                  <Textarea
                    className="min-h-12 w-full resize-y field-sizing-fixed"
                    rows={2}
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
            className="block min-h-12 w-full min-w-0 resize-y field-sizing-fixed"
            rows={2}
            id={`${interaction.id}-answer`}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Type your response"
            value={answer}
          />
        </div>
      )}
      {canAnswer ? (
        <div className="mt-2 flex justify-end">
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

function QuestionComment({
  disabled,
  label,
  hasComment,
  selected,
  onOpen,
  children,
}: {
  disabled?: boolean;
  label: string;
  hasComment: boolean;
  selected: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(hasComment);
  const expanded = selected && open;
  return (
    <>
      <Button
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Hide' : 'Add'} comment on ${label}`}
        title={`${expanded ? 'Hide' : 'Add'} comment on ${label}`}
        className={cn(
          'absolute right-1 top-1 size-6 p-0 text-muted-foreground',
          hasComment && 'text-primary',
        )}
        disabled={disabled}
        onClick={() => {
          if (expanded) setOpen(false);
          else {
            onOpen();
            setOpen(true);
          }
        }}
        size="sm"
        variant="ghost"
      >
        {expanded ? (
          <MinusIcon aria-hidden="true" className="size-3.5" />
        ) : (
          <AddIcon aria-hidden="true" className="size-3.5" />
        )}
      </Button>
      {expanded ? children : null}
    </>
  );
}
