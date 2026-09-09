import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { respondFromControl } from './interaction-control';
import { planModeLabel } from './plan-mode-label';

/** Explicit plan decisions; selecting a choice never submits or executes it. */
export function PlanDecisionControls({
  interaction,
  disabled,
  onResponse,
}: {
  interaction: PendingInteraction;
  disabled?: boolean;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const options = interaction.payload?.options ?? [];
  const modes = options.filter((option) =>
    ['auto', 'interactive', 'exit_only'].includes(option.value || option.label),
  );
  const [choice, setChoice] = useState('');
  const [mode, setMode] = useState('');
  const [clearContext, setClearContext] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const commentRef = useRef<HTMLButtonElement>(null);
  const plan = interaction.payload?.plan_exit;
  const complete = plan?.plan_content_status === 'complete' && Boolean(plan.plan_content?.trim());
  const canExecute = choice === 'execute' && Boolean(mode) && (mode === 'exit_only' || complete);
  const canReject = options.some((option) => (option.value || option.label) === 'reject');
  const canClear = options.some((option) => (option.value || option.label) === 'clear_context');
  const rejecting = choice === 'reject';
  const id = interaction.id;
  const submit = () =>
    respondFromControl(
      onResponse(interaction, {
        action: 'answer',
        answer: feedback.trim() || undefined,
        selected_options: rejecting
          ? ['reject']
          : [mode, ...(clearContext ? ['clear_context'] : [])],
      }),
    );

  return (
    <FieldSet className="gap-2" data-slot="plan-decision-controls" disabled={disabled}>
      <FieldLegend className="sr-only">Plan decision</FieldLegend>
      <Popover open={commentOpen} onOpenChange={setCommentOpen}>
        <PopoverAnchor asChild>
          <RadioGroup
            aria-label="Plan decision"
            disabled={disabled}
            value={choice}
            onValueChange={(value) => {
              setChoice(value);
              setCommentOpen(value === 'reject');
            }}
            className="gap-3"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Field
                orientation="horizontal"
                className="flex-wrap [&>[data-slot=field-label]]:flex-none"
              >
                <RadioGroupItem
                  id={`${id}-execute`}
                  value="execute"
                  aria-label="Execute plan"
                  disabled={!modes.length}
                />
                <FieldLabel htmlFor={`${id}-execute`} className="flex-none">
                  Execute plan in
                </FieldLabel>
                <Select
                  disabled={disabled || !modes.length}
                  value={mode}
                  onValueChange={(value) => {
                    setMode(value);
                    setChoice('execute');
                  }}
                >
                  <SelectTrigger
                    id={`${id}-execution-mode`}
                    aria-label="Execution mode"
                    className="w-auto max-w-full"
                    size="sm"
                  >
                    <SelectValue placeholder="Choose mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {modes.map((option) => {
                        const value = option.value || option.label;
                        return (
                          <SelectItem key={value} value={value}>
                            {planModeLabel(value)}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <span className="text-sm">mode</span>
              </Field>
              {canClear ? (
                <Field orientation="horizontal" className="pl-6">
                  <Checkbox
                    id={`${id}-clear-context`}
                    checked={clearContext}
                    disabled={disabled || choice !== 'execute'}
                    onCheckedChange={(value) => setClearContext(value === true)}
                  />
                  <FieldLabel htmlFor={`${id}-clear-context`}>
                    Clear conversation context
                  </FieldLabel>
                </Field>
              ) : null}
            </div>
            {canReject ? (
              <Field orientation="horizontal">
                <RadioGroupItem
                  ref={rejectRef}
                  id={`${id}-reject`}
                  value="reject"
                  onClick={() => setCommentOpen(true)}
                />
                <FieldLabel htmlFor={`${id}-reject`}>Reject plan with comments</FieldLabel>
              </Field>
            ) : null}
          </RadioGroup>
        </PopoverAnchor>
        {choice === 'execute' ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              ref={commentRef}
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setCommentOpen(true)}
            >
              {feedback.trim() ? 'Edit comment' : 'Add comment'}
            </Button>
            <Button size="sm" disabled={disabled || !canExecute} onClick={submit}>
              {mode === 'exit_only' ? 'Leave Plan mode' : 'Execute plan'}
            </Button>
          </div>
        ) : null}
        <PopoverContent
          align="start"
          className="w-80 max-w-[calc(100vw-2rem)]"
          aria-label={rejecting ? 'Reject plan with comments' : 'Execution comment'}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (rejecting ? rejectRef : commentRef).current?.focus();
          }}
        >
          <FieldGroup className="gap-2">
            <Field className="gap-1.5">
              <FieldLabel htmlFor={`${id}-plan-feedback`}>
                {rejecting ? 'What should change?' : 'Comment (optional)'}
              </FieldLabel>
              <Textarea
                id={`${id}-plan-feedback`}
                className="min-h-20 max-h-48 resize-y field-sizing-fixed"
                disabled={disabled}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder={
                  rejecting ? 'Describe the changes you need…' : 'Add context for execution'
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCommentOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={disabled || (rejecting && !feedback.trim())}
                onClick={() => {
                  if (rejecting) submit();
                  else setCommentOpen(false);
                }}
              >
                {rejecting ? 'Request changes' : 'Save comment'}
              </Button>
            </div>
          </FieldGroup>
        </PopoverContent>
      </Popover>
    </FieldSet>
  );
}
