import type { A2UISurface, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import {
  AlertTriangleIcon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  RotateCcwIcon,
  ShieldQuestionIcon,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { PermissionAction } from '@/lib/pending-interaction-contract';
import { handleScrollableRegionKeys } from '@/lib/scrollable-region-keys';
import { cn } from '@/lib/utils';
import { ClioA2UISurface, type A2UILocalActionHandler } from './a2ui-surface';
import { respondFromControl } from './interaction-control';
import { InteractionFrameHeader } from './interaction-frame-header';
import {
  OwnerAttribution,
  PendingSurfaceNotices,
  ResponseErrorNotice,
} from './pending-interaction-notices';
import { StructuredQuestionResponse, UrlConsentResponse } from './question-interaction-forms';

export interface ClioPendingInteractionsProps {
  interactions: readonly PendingInteraction[];
  surfaces?: Readonly<Record<string, A2UISurface>>;
  ownerLabels?: Readonly<Record<string, string>>;
  /** The session currently on screen; every other owner gets attributed. */
  viewedSessionId: string;
  disabled?: boolean;
  /** The read that could not be completed, surfaced here rather than swallowed. */
  error?: Error;
  /**
   * The capability negotiation that failed, if it did. Responses still work
   * over the legacy routes, so this is a note on the same surface rather than
   * a second alert elsewhere on the page — the reader learns why the surface
   * is degraded exactly where the degraded surface is.
   */
  capabilityError?: Error;
  onA2UILocalAction?: A2UILocalActionHandler;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  /** Retries the surface read for an A2UI card still waiting on its surface. */
  onRefetchSurfaces?: () => void;
}

/** Renders the attended task's pending interaction stack immediately above the composer. */
export function ClioPendingInteractions({
  interactions,
  surfaces = {},
  ownerLabels = {},
  viewedSessionId,
  disabled,
  error,
  capabilityError,
  onA2UILocalAction,
  onResponse,
  onRefetchSurfaces,
}: ClioPendingInteractionsProps) {
  const responseInFlight = useRef(new Set<string>());
  const [respondingIds, setRespondingIds] = useState<ReadonlySet<string>>(new Set());
  // Keyed per interaction, never a single shared field: a card that failed to
  // answer must not have its error read as belonging to whichever card the
  // reader tries next, and a failure on one card must never disable or blank
  // out every other card's own error.
  const [responseErrors, setResponseErrors] = useState<ReadonlyMap<string, Error>>(new Map());
  const pending = interactions.filter(
    (interaction) =>
      interaction.status === 'pending' && interaction.requires_human_response !== false,
  );
  const handleResponse = useCallback(
    async (interaction: PendingInteraction, response: PendingInteractionResponse) => {
      if (responseInFlight.current.has(interaction.id)) return;
      responseInFlight.current.add(interaction.id);
      setRespondingIds(new Set(responseInFlight.current));
      setResponseErrors((current) => dropEntry(current, interaction.id));
      try {
        await onResponse(interaction, response);
      } catch (thrown) {
        const responseError = thrown instanceof Error ? thrown : new Error(String(thrown));
        setResponseErrors((current) => new Map(current).set(interaction.id, responseError));
        throw thrown;
      } finally {
        responseInFlight.current.delete(interaction.id);
        setRespondingIds(new Set(responseInFlight.current));
      }
    },
    [onResponse],
  );
  // A failed read still owns this surface: the reader is told which responses
  // could not be listed instead of being shown an empty, silently-degraded stack.
  if (pending.length === 0 && !error && !capabilityError) return null;

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
            className="max-h-[min(22rem,40dvh)] min-h-0 w-full shrink [&_[data-orientation=vertical]]:w-1.5 [&_[data-slot=scroll-area-scrollbar]]:opacity-50"
            scrollHideDelay={500}
            type="hover"
            viewportProps={{
              'aria-label': `${pending.length} pending responses`,
              className: 'pending-interactions-viewport overscroll-contain pr-1',
              onKeyDown: handleScrollableRegionKeys,
              role: 'region',
              tabIndex: 0,
            }}
          >
            <div className="flex min-w-0 flex-col gap-2 px-1 pb-1">
              <PendingSurfaceNotices capabilityError={capabilityError} error={error} />
              {pending.map((interaction) => {
                // Undefined (never 'Specialist') means the workspace has not listed
                // this owner session yet, or listed it without a usable title — the
                // typed unavailable presentation says so instead of inventing a role.
                const ownerLabel = ownerLabels[interaction.owner_session_id];
                const showOwner = interaction.owner_session_id !== viewedSessionId;
                // The card that is actually in flight is the only one that disables —
                // a caller-supplied `disabled` is for a genuinely surface-wide reason,
                // never a stand-in for "some other card's response is in flight."
                const interactionDisabled = disabled || respondingIds.has(interaction.id);
                const responseError = responseErrors.get(interaction.id);
                if (interaction.kind === 'permission') {
                  return (
                    <PermissionResponse
                      disabled={interactionDisabled}
                      interaction={interaction}
                      key={interaction.id}
                      onResponse={handleResponse}
                      ownerLabel={ownerLabel}
                      responseError={responseError}
                      showOwner={showOwner}
                    />
                  );
                }
                if (interaction.kind === 'a2ui') {
                  const surfaceId = interaction.source.surface_id;
                  // Looked up by id alone, WITHOUT the owner-session filter: the
                  // component below distinguishes "not found yet" from "found, but
                  // it belongs to a different session" instead of collapsing both
                  // into the same "loading" message.
                  const rawSurface = surfaceId
                    ? (surfaces[`${interaction.owner_session_id}:${surfaceId}`] ??
                      surfaces[surfaceId])
                    : undefined;
                  return (
                    <A2UIResponse
                      disabled={interactionDisabled}
                      interaction={interaction}
                      key={interaction.id}
                      onLocalAction={onA2UILocalAction}
                      onRefetchSurface={onRefetchSurfaces}
                      onResponse={handleResponse}
                      ownerLabel={ownerLabel}
                      rawSurface={rawSurface}
                      responseError={responseError}
                      showOwner={showOwner}
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
                    responseError={responseError}
                    showOwner={showOwner}
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

function dropEntry<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

function PermissionResponse({
  disabled,
  interaction,
  onResponse,
  ownerLabel,
  responseError,
  showOwner,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
}) {
  const toolCall = interaction.payload?.tool_call;
  const toolName = toolCall?.tool_name ?? interaction.source.tool_name;
  const allowed = interaction.actions ? new Set(interaction.actions) : undefined;
  const show = (action: string) => !allowed || allowed.has(action);
  // A future server can offer an action this client does not yet render a
  // control for. It is shown, disabled, with its own label — never silently
  // dropped, which would leave the reader unable to tell it was ever offered.
  const unrecognizedActions = (interaction.actions ?? []).filter(
    (action) => !KNOWN_PERMISSION_ACTIONS.has(action),
  );
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
        <OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show={showOwner} />
        {interaction.prompt ? (
          <span className="block text-sm text-muted-foreground">{interaction.prompt}</span>
        ) : null}
        <ResponseErrorNotice error={responseError} />
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
          {unrecognizedActions.map((action) => (
            <ConfirmationAction
              disabled
              key={action}
              title={`This client cannot offer "${action}" yet.`}
              variant="outline"
            >
              {action}
            </ConfirmationAction>
          ))}
        </ConfirmationActions>
      </ConfirmationRequest>
    </Confirmation>
  );
}

// Kept as literal values of PermissionAction (not the type itself): membership
// is checked against arbitrary server-offered strings, which may legitimately
// be outside that union — that is exactly the "unrecognized" case this guards.
const KNOWN_PERMISSION_ACTIONS: ReadonlySet<string> = new Set<PermissionAction>([
  'deny',
  'allow_workspace',
  'allow_session',
  'allow',
]);

function QuestionResponse({
  interaction,
  disabled,
  onResponse,
  ownerLabel,
  responseError,
  showOwner,
}: {
  interaction: PendingInteraction;
  disabled?: boolean;
  onResponse: ClioPendingInteractionsProps['onResponse'];
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

function A2UIResponse({
  disabled,
  interaction,
  onLocalAction,
  onRefetchSurface,
  onResponse,
  ownerLabel,
  rawSurface,
  responseError,
  showOwner,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onLocalAction?: A2UILocalActionHandler;
  onRefetchSurface?: () => void;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel?: string;
  rawSurface?: A2UISurface;
  responseError?: Error;
  showOwner: boolean;
}) {
  return (
    <Frame
      className="min-w-0 self-stretch border-violet-500/25 bg-violet-500/[0.04]"
      data-interaction-kind={interaction.kind}
      dense
      spacing="sm"
    >
      <InteractionFrameHeader
        interaction={interaction}
        onCancel={
          (interaction.actions ?? []).includes('cancel')
            ? () => respondFromControl(onResponse(interaction, { action: 'cancel' }))
            : undefined
        }
        ownerLabel={ownerLabel}
        showOwner={showOwner}
      />
      <FramePanel
        className={cn(
          'p-2',
          // 0.7, not 0.5/0.6, is this repo's WCAG AA contrast floor for a
          // dimmed-but-readable disabled surface (see reui/sortable.tsx).
          disabled && 'pointer-events-none opacity-70',
        )}
      >
        <ResponseErrorNotice error={responseError} />
        <A2UISurfaceBody
          interaction={interaction}
          onLocalAction={onLocalAction}
          onRefetchSurface={onRefetchSurface}
          onResponse={onResponse}
          rawSurface={rawSurface}
        />
      </FramePanel>
    </Frame>
  );
}

/**
 * "Interactive view is loading." collapsed three distinct realities into one
 * message. Only the first is transient — the other two will never resolve by
 * waiting, and telling them apart matters: a surface addressed to a different
 * session is a security-relevant rejection, not a slow read.
 */
function A2UISurfaceBody({
  interaction,
  onLocalAction,
  onRefetchSurface,
  onResponse,
  rawSurface,
}: {
  interaction: PendingInteraction;
  onLocalAction?: A2UILocalActionHandler;
  onRefetchSurface?: () => void;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  rawSurface?: A2UISurface;
}) {
  if (!interaction.source.surface_id) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        This interactive view has no surface to open.
      </p>
    );
  }
  if (rawSurface && rawSurface.session_id !== interaction.owner_session_id) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        This interactive view was rejected: it was addressed to a different session.
      </p>
    );
  }
  if (!rawSurface) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
        <span className="flex-1">Interactive view is loading.</span>
        {onRefetchSurface ? (
          <Button onClick={onRefetchSurface} size="sm" type="button" variant="ghost">
            <RotateCcwIcon aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <ClioA2UISurface
      onLocalAction={onLocalAction}
      onRemoteAction={(message) =>
        onResponse(interaction, {
          correlation: surfaceCorrelation(interaction, rawSurface),
          message,
        })
      }
      surface={rawSurface}
    />
  );
}

/**
 * The A2UI message identity a response answers, for the server's own
 * correlation — dropped entirely on this path before, unlike the surface's
 * own direct action mutation (a2ui-surface.tsx), which always sent it. The
 * surface's own run/message/part ids are authoritative; the interaction's
 * invocation_id is the only signal left once those are unavailable.
 */
function surfaceCorrelation(
  interaction: PendingInteraction,
  surface: A2UISurface,
): { run_id?: string; message_id?: string; part_id?: string } {
  return {
    run_id: surface.run_id,
    message_id: surface.message_id,
    part_id: surface.part_id ?? interaction.source.invocation_id,
  };
}
