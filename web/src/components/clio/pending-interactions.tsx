import type {
  A2UIActionLifecycle,
  A2UISurface,
  PendingInteraction,
  PendingInteractionResponse,
} from '@clio/core/v3';
import { MessageCircleQuestionIcon, ShieldQuestionIcon } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PermissionAction } from '@/lib/pending-interaction-contract';
import { handleScrollableRegionKeys } from '@/lib/scrollable-region-keys';
import { respondFromControl } from './interaction-control';
import { PendingA2UIResponse } from './pending-a2ui-response';
import { QuestionResponse } from './pending-interaction-question-response';
import {
  OwnerAttribution,
  PendingSurfaceNotices,
  ResponseErrorNotice,
} from './pending-interaction-notices';
import { PlanExitResponse } from './plan-exit-interaction';

export interface ClioPendingInteractionsProps {
  interactions: readonly PendingInteraction[];
  surfaces?: Readonly<Record<string, A2UISurface>>;
  /**
   * Server-truth footer state per surface id (`EntityState.a2ui_action_lifecycles`,
   * dispatcher slice S5) — the same map the main transcript and subagent canvas
   * already read from the live store. A cross-session surface with no open
   * stream simply has no entry here yet, which the footer already renders as
   * "no lifecycle known" (nothing), not an error.
   */
  actionLifecycles?: Readonly<Record<string, A2UIActionLifecycle>>;
  ownerLabels?: Readonly<Record<string, string>>;
  /** The session on screen; every other owner gets attributed. */
  viewedSessionId: string;
  disabled?: boolean;
  error?: Error;
  /** Failed capability negotiation; legacy responses may remain available. */
  capabilityError?: Error;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  onRefetchSurfaces?: () => void;
}

/** Renders pending interactions immediately above the composer. */
export function ClioPendingInteractions({
  interactions,
  surfaces = {},
  actionLifecycles = {},
  ownerLabels = {},
  viewedSessionId,
  disabled,
  error,
  capabilityError,
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
                    <PendingA2UIResponse
                      actionLifecycle={rawSurface ? actionLifecycles[rawSurface.id] : undefined}
                      disabled={interactionDisabled}
                      interaction={interaction}
                      key={interaction.id}
                      onRefetchSurface={onRefetchSurfaces}
                      onResponse={handleResponse}
                      ownerLabel={ownerLabel}
                      rawSurface={rawSurface}
                      responseError={responseError}
                      showOwner={showOwner}
                    />
                  );
                }
                if (interaction.source.tool_name === 'plan_exit') {
                  return (
                    <PlanExitResponse
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
