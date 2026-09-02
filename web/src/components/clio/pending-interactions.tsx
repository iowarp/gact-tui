import type { A2UISurface, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import {
  BoxesIcon,
  BotIcon,
  ClipboardPenLineIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import {
  Queue,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ClioA2UISurface, type A2UILocalActionHandler } from './a2ui-surface';

export interface ClioPendingInteractionsProps {
  interactions: readonly PendingInteraction[];
  surfaces?: Readonly<Record<string, A2UISurface>>;
  ownerLabels?: Readonly<Record<string, string>>;
  disabled?: boolean;
  onA2UILocalAction?: A2UILocalActionHandler;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}

/** Renders the attended task's pending interaction stack immediately above the composer. */
export function ClioPendingInteractions({
  interactions,
  surfaces = {},
  ownerLabels = {},
  disabled,
  onA2UILocalAction,
  onResponse,
}: ClioPendingInteractionsProps) {
  const responseInFlight = useRef(new Set<string>());
  const [respondingIds, setRespondingIds] = useState<ReadonlySet<string>>(new Set());
  const pending = interactions.filter((interaction) => interaction.status === 'pending');
  const handleResponse = useCallback(
    async (interaction: PendingInteraction, response: PendingInteractionResponse) => {
      if (responseInFlight.current.has(interaction.id)) return;
      responseInFlight.current.add(interaction.id);
      setRespondingIds(new Set(responseInFlight.current));
      try {
        await onResponse(interaction, response);
      } finally {
        responseInFlight.current.delete(interaction.id);
        setRespondingIds(new Set(responseInFlight.current));
      }
    },
    [onResponse],
  );
  if (pending.length === 0) return null;

  return (
    <Queue
      aria-label="Agent needs your response"
      aria-live="polite"
      // No background of its own: this panel floats over the conversation
      // stacked directly on the composer, and the two read as one surface only
      // while it keeps the Queue's translucent bg-card/70 (dark: /60) — the
      // exact tone the composer gives its input group. An opaque fill here also
      // cancels the backdrop blur that makes the float legible.
      className="relative z-10 mx-auto -mb-px min-h-0 w-[calc(100%_-_1.5rem)] max-w-[54.5rem] shrink rounded-b-none border-b-0 py-0.5"
      role="region"
    >
      {/* Open by default: the agent is blocked until one of these controls is used,
          so they must be mounted and reachable without a preceding expand. The
          trigger still collapses the stack when the reader wants the room back. */}
      <QueueSection className="flex min-h-0 flex-col">
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={pending.length}
            icon={<MessageCircleQuestionIcon aria-hidden="true" className="size-3.5" />}
            label={pending.length === 1 ? 'response needed' : 'responses needed'}
          />
        </QueueSectionTrigger>
        <QueueSectionContent className="flex min-h-0 flex-col">
          <ScrollArea
            className="h-[min(22rem,40dvh)] min-h-0 w-full shrink [&_[data-orientation=vertical]]:w-1.5 [&_[data-slot=scroll-area-scrollbar]]:opacity-50"
            scrollHideDelay={500}
            type="hover"
            viewportProps={{
              'aria-label': `${pending.length} pending responses`,
              // Radix measures arbitrary horizontal content with a table wrapper.
              // These interaction cards are strictly vertical; block layout keeps
              // percentage-width fields from collapsing during table intrinsic sizing.
              className: 'overscroll-contain pr-1 [&>div]:!block [&>div]:min-w-full',
              onKeyDown: handlePendingResponseScroll,
              role: 'region',
              tabIndex: 0,
            }}
          >
            <div className="flex w-full min-w-0 flex-col gap-2 px-1 pb-1">
              {pending.map((interaction) => {
                const ownerLabel = ownerLabels[interaction.owner_session_id] ?? 'Specialist';
                const interactionDisabled = disabled || respondingIds.has(interaction.id);
                if (interaction.kind === 'permission') {
                  return (
                    <PermissionResponse
                      disabled={interactionDisabled}
                      interaction={interaction}
                      key={interaction.id}
                      onResponse={handleResponse}
                      ownerLabel={ownerLabel}
                    />
                  );
                }
                if (interaction.kind === 'a2ui') {
                  const surfaceId = interaction.source.surface_id;
                  const surface = surfaceId
                    ? (surfaces[`${interaction.owner_session_id}:${surfaceId}`] ??
                      surfaces[surfaceId])
                    : undefined;
                  return (
                    <A2UIResponse
                      disabled={interactionDisabled}
                      interaction={interaction}
                      key={interaction.id}
                      onLocalAction={onA2UILocalAction}
                      onResponse={handleResponse}
                      ownerLabel={ownerLabel}
                      surface={
                        surface?.session_id === interaction.owner_session_id ? surface : undefined
                      }
                    />
                  );
                }
                return (
                  <QuestionResponse
                    disabled={interactionDisabled}
                    interaction={interaction}
                    key={interaction.id}
                    onResponse={handleResponse}
                    ownerLabel={ownerLabel}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

function handlePendingResponseScroll(event: KeyboardEvent<HTMLDivElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const viewport = event.currentTarget;
  const page = Math.max(viewport.clientHeight - 24, 40);
  const destinations: Partial<Record<string, number>> = {
    ArrowDown: viewport.scrollTop + 40,
    ArrowUp: viewport.scrollTop - 40,
    End: viewport.scrollHeight,
    Home: 0,
    PageDown: viewport.scrollTop + page,
    PageUp: viewport.scrollTop - page,
  };
  const destination = destinations[event.key];
  if (destination === undefined) return;
  event.preventDefault();
  viewport.scrollTop = Math.max(0, Math.min(destination, viewport.scrollHeight - viewport.clientHeight));
}

function OwnerContext({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex min-w-0 items-center gap-1 truncate text-xs font-normal text-muted-foreground"
      data-slot="pending-interaction-owner"
    >
      <BotIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function PermissionResponse({
  disabled,
  interaction,
  onResponse,
  ownerLabel,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel: string;
}) {
  const toolCall = interaction.payload?.tool_call;
  const toolName = toolCall?.tool_name ?? interaction.source.tool_name;
  const allowed = interaction.actions ? new Set(interaction.actions) : undefined;
  const show = (action: string) => !allowed || allowed.has(action);
  const showOwner = interaction.owner_session_id !== interaction.attended_session_id;
  return (
    <Confirmation
      approval={{ id: interaction.id }}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 border-action/20 bg-background/70"
      data-interaction-kind={interaction.kind}
      state="approval-requested"
    >
      <ShieldQuestionIcon aria-hidden="true" className="mt-0.5 size-4 text-action" />
      <ConfirmationTitle className="min-w-0">
        <span
          className="block line-clamp-3 font-medium"
          data-slot="pending-interaction-title"
          title={interaction.title}
        >
          {interaction.title}
        </span>
        {showOwner ? <OwnerContext>{ownerLabel}</OwnerContext> : null}
        {interaction.prompt ? (
          <span className="block text-sm text-muted-foreground">{interaction.prompt}</span>
        ) : null}
        {toolName || toolCall?.input !== undefined ? (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Technical details</summary>
            {toolName ? <p className="mt-1 font-mono">{toolName}</p> : null}
            {toolCall?.input === undefined ? null : (
              <CodeBlock
                className="mt-2 max-h-40"
                code={JSON.stringify(toolCall.input, null, 2)}
                language="json"
              >
                <CodeBlockCopyButton aria-label="Copy protected action details" />
              </CodeBlock>
            )}
          </details>
        ) : null}
      </ConfirmationTitle>
      <ConfirmationRequest>
        <ConfirmationActions className="col-span-2 mt-1 flex-wrap">
          {show('deny') ? (
            <ConfirmationAction
              disabled={disabled}
              onClick={() => respondFromControl(onResponse(interaction, { action: 'deny' }))}
              variant="destructive"
            >
              Deny
            </ConfirmationAction>
          ) : null}
          {show('allow_workspace') ? (
            <ConfirmationAction
              disabled={disabled}
              onClick={() =>
                respondFromControl(onResponse(interaction, { action: 'allow_workspace' }))
              }
              variant="outline"
            >
              Allow for workspace
            </ConfirmationAction>
          ) : null}
          {show('allow_session') ? (
            <ConfirmationAction
              disabled={disabled}
              onClick={() =>
                respondFromControl(onResponse(interaction, { action: 'allow_session' }))
              }
              variant="outline"
            >
              Allow for session
            </ConfirmationAction>
          ) : null}
          {show('allow') ? (
            <ConfirmationAction
              disabled={disabled}
              onClick={() => respondFromControl(onResponse(interaction, { action: 'allow' }))}
            >
              Allow once
            </ConfirmationAction>
          ) : null}
        </ConfirmationActions>
      </ConfirmationRequest>
    </Confirmation>
  );
}

function InteractionFrameHeader({
  interaction,
  ownerLabel,
  onCancel,
  disabled,
}: {
  interaction: PendingInteraction;
  ownerLabel: string;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  const Icon =
    interaction.kind === 'mcp_task_input'
      ? ClipboardPenLineIcon
      : interaction.kind === 'a2ui'
        ? BoxesIcon
        : MessageCircleQuestionIcon;
  const showOwner = interaction.owner_session_id !== interaction.attended_session_id;
  return (
    <FrameHeader className="relative flex-row items-start gap-2 pr-10">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-action" />
      <div className="min-w-0 flex-1">
        <FrameTitle
          className="truncate"
          data-slot="pending-interaction-title"
          title={interaction.prompt ?? interaction.title}
        >
          {interaction.prompt ?? interaction.title}
        </FrameTitle>
        {showOwner ? <OwnerContext>{ownerLabel}</OwnerContext> : null}
      </div>
      {onCancel ? (
        <Button
          aria-label="Cancel question"
          className="absolute right-2 top-1"
          disabled={disabled}
          onClick={onCancel}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </FrameHeader>
  );
}

function QuestionResponse({
  interaction,
  disabled,
  onResponse,
  ownerLabel,
}: {
  interaction: PendingInteraction;
  disabled?: boolean;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel: string;
}) {
  const [answer, setAnswer] = useState('');
  const [selection, setSelection] = useState('');
  const [optionComments, setOptionComments] = useState<Record<string, string>>({});
  const options = interaction.payload?.options ?? [];
  const usesOptions = options.length > 0;
  const allowsFreeform = interaction.payload?.allow_freeform === true;
  const freeformValue = `${interaction.id}:freeform`;
  const usesFreeform = !usesOptions || selection === freeformValue;
  const canAnswer = (interaction.actions ?? []).includes('answer');
  const canSubmit =
    canAnswer &&
    (usesOptions
      ? Boolean(selection) && (!usesFreeform || Boolean(answer.trim()))
      : Boolean(answer.trim()));
  const selectedComment = optionComments[selection]?.trim() ?? '';

  return (
    <Frame
      className={cn(
        'w-full min-w-0',
        interaction.kind === 'mcp_task_input' &&
          'border-sky-500/25 bg-sky-500/[0.04] dark:bg-sky-400/[0.05]',
      )}
      data-interaction-kind={interaction.kind}
      dense
      spacing="sm"
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
      />
      <FramePanel className="min-w-0 overflow-hidden">
        {!canAnswer ? (
          <p className="text-sm text-muted-foreground">Input controls are not available yet.</p>
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
                    <Field className="gap-1 border-t border-border/60 px-2.5 py-2">
                      <FieldLabel
                        className="w-auto text-xs font-normal text-muted-foreground"
                        htmlFor={`${interaction.id}-${value}-comment`}
                      >
                        Comment on {option.label} (optional)
                      </FieldLabel>
                      <Textarea
                        aria-label={`Comment on ${option.label}`}
                        className="min-h-12 resize-y bg-background/60"
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
                    </Field>
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
                  <Field className="gap-1 border-t border-border/60 px-2.5 py-2">
                    <FieldLabel htmlFor={`${interaction.id}-answer`}>Your response</FieldLabel>
                    <Textarea
                      disabled={disabled}
                      id={`${interaction.id}-answer`}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Type your response"
                      value={answer}
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}
          </RadioGroup>
        ) : (
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${interaction.id}-answer`}>Your response</FieldLabel>
            <Textarea
              className="w-full min-w-0"
              id={`${interaction.id}-answer`}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Type your response"
              value={answer}
            />
          </Field>
        )}
        {canAnswer ? (
          <div className="mt-4 flex justify-end">
            <Button
              disabled={disabled || !canSubmit}
              onClick={() =>
                respondFromControl(
                  onResponse(
                    interaction,
                    usesOptions && !usesFreeform
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

function A2UIResponse({
  disabled,
  interaction,
  onLocalAction,
  onResponse,
  ownerLabel,
  surface,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onLocalAction?: A2UILocalActionHandler;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel: string;
  surface?: A2UISurface;
}) {
  return (
    <Frame
      className="w-full min-w-0 border-violet-500/25 bg-violet-500/[0.04]"
      data-interaction-kind={interaction.kind}
      dense
      spacing="sm"
    >
      <InteractionFrameHeader interaction={interaction} ownerLabel={ownerLabel} />
      <FramePanel className={cn('p-2', disabled && 'pointer-events-none opacity-60')}>
        {surface ? (
          <ClioA2UISurface
            onLocalAction={onLocalAction}
            onRemoteAction={(message) => onResponse(interaction, { message })}
            surface={surface}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Interactive view is loading.</p>
        )}
      </FramePanel>
    </Frame>
  );
}

function respondFromControl(response: Promise<void>): void {
  void response.catch(() => {
    // The owning mutation presents authoritative server errors beside the composer.
  });
}
