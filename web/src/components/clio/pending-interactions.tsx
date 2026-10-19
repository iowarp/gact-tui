import { useAttentionDraft } from './attention-drafts';
import type {
  A2UIActionLifecycle,
  A2UISurface,
  PendingInteraction,
  PendingInteractionResponse,
} from '@clio/core/v3';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { PermissionResponse } from './permission-response';
import {
  Queue,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue';
import { ScrollArea } from '@/components/ui/scroll-area';
import { handleScrollableRegionKeys } from '@/lib/scrollable-region-keys';
import { cn } from '@/lib/utils';
import { ATTENTION_REVEAL_EVENT } from './interaction-control';
import { SurfaceQuestionNotice } from './surface-question-notice';
import { PendingA2UIResponse } from './pending-a2ui-response';
import { embedsQuestionSurface } from '@/lib/a2ui/question-navigation';
import { QuestionResponse } from './pending-interaction-question-response';
import { PendingSurfaceNotices } from './pending-interaction-notices';
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
  onOpenSurfaceQuestion?: (interaction: PendingInteraction) => void;
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
  onOpenSurfaceQuestion,
}: ClioPendingInteractionsProps) {
  const responseInFlight = useRef(new Set<string>());
  const [respondingIds, setRespondingIds] = useAttentionDraft<ReadonlySet<string>>(
    '$panel:responding',
    () => new Set(),
  );
  // Keyed per interaction, never a single shared field: a card that failed to
  // answer must not have its error read as belonging to whichever card the
  // reader tries next, and a failure on one card must never disable or blank
  // out every other card's own error.
  const [responseErrors, setResponseErrors] = useAttentionDraft<ReadonlyMap<string, Error>>(
    '$panel:errors',
    () => new Map(),
  );
  const pending = interactions.filter(
    (interaction) =>
      interaction.status === 'pending' && interaction.requires_human_response !== false,
  );
  const [selection, setSelection] = useAttentionDraft('$panel:selection', () => ({
    id: '',
    index: 0,
  }));
  const [open, setOpen] = useAttentionDraft('$panel:open', true);
  const foundIndex = pending.findIndex((row) => row.id === selection.id);
  const index =
    foundIndex < 0 ? Math.min(selection.index, Math.max(0, pending.length - 1)) : foundIndex;
  const selected = pending[index];
  const selectedId = selected?.id;
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Synchronize the conversation-owned draft store with server removals.
    if (selectedId && (selection.id !== selectedId || selection.index !== index)) {
      setSelection({ id: selectedId, index });
    }
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [selectedId, index, selection.id, selection.index, setSelection]);
  useEffect(() => {
    const reveal = (event: Event) => {
      const id: unknown = (event as CustomEvent).detail;
      const next = pending.findIndex((row) => row.id === id);
      if (next >= 0) {
        setSelection({ id: pending[next]!.id, index: next });
        setOpen(true);
      }
    };
    window.addEventListener(ATTENTION_REVEAL_EVENT, reveal);
    return () => window.removeEventListener(ATTENTION_REVEAL_EVENT, reveal);
  }, [pending, setOpen, setSelection]);
  const navigate = (next: number) => {
    if (!pending[next]) return;
    setSelection({ id: pending[next]!.id, index: next });
    setOpen(true);
  };
  const hasInteractiveSurface = selected?.kind === 'a2ui' || Boolean(selected?.source.surface_id);
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
    [onResponse, setResponseErrors, setRespondingIds],
  );
  // A failed read still owns this surface: the reader is told which responses
  // could not be listed instead of being shown an empty, silently-degraded stack.
  if (pending.length === 0 && !error && !capabilityError) return null;

  return (
    <Queue
      aria-label="Agent needs your attention"
      aria-live="polite"
      // Match the queue and composer, including the rounded outer boundary.
      className="relative z-10 mx-auto -mb-px min-h-0 w-[calc(100%_-_1.5rem)] max-w-[54.5rem] shrink overflow-hidden rounded-b-none border-b-0 border-composer-border bg-composer py-1 shadow-none backdrop-blur-none dark:bg-composer dark:shadow-none"
      role="region"
    >
      {/* Open by default: the agent is blocked until one of these controls is used,
          so they must be mounted and reachable without a preceding expand. The
          trigger still collapses the stack when the reader wants the room back. */}
      <QueueSection className="flex min-h-0 flex-col" open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-2 py-1">
          <QueueSectionTrigger
            className="h-7 min-w-0 flex-1"
            data-slot="pending-interactions-trigger"
          >
            <QueueSectionLabel label="Agent needs your attention" />
          </QueueSectionTrigger>
          {pending.length > 1 ? (
            <nav aria-label="Pending requests" className="flex shrink-0 items-center gap-0.5">
              <Button
                aria-label="Previous request"
                disabled={index === 0}
                onClick={() => navigate(index - 1)}
                size="icon-sm"
                variant="ghost"
              >
                <ChevronLeftIcon aria-hidden="true" className="size-4" />
              </Button>
              <span
                className="min-w-10 text-center text-xs tabular-nums text-muted-foreground"
                aria-live="polite"
                aria-atomic="true"
              >
                {index + 1} / {pending.length}
              </span>
              <Button
                aria-label="Next request"
                disabled={index === pending.length - 1}
                onClick={() => navigate(index + 1)}
                size="icon-sm"
                variant="ghost"
              >
                <ChevronRightIcon aria-hidden="true" className="size-4" />
              </Button>
            </nav>
          ) : null}
        </div>
        <QueueSectionContent
          hidden={!open}
          forceMount
          className="flex min-h-0 flex-col data-[state=closed]:hidden"
        >
          <ScrollArea
            className={cn(
              'min-h-0 w-full shrink [&_[data-orientation=vertical]]:w-1.5 [&_[data-slot=scroll-area-scrollbar]]:opacity-50',
              // Reserve room for the composer rather than allowing a tall
              // visual to push its controls beyond the conversation viewport.
              hasInteractiveSurface || selected?.payload?.access
                ? 'max-h-[calc(100dvh-12rem)]'
                : 'max-h-[min(22rem,40dvh)]',
            )}
            scrollHideDelay={500}
            type="hover"
            viewportProps={{
              ref: viewportRef,
              'aria-label': `${pending.length} pending responses`,
              className: 'pending-interactions-viewport overscroll-contain pr-1',
              onKeyDown: handleScrollableRegionKeys,
              role: 'region',
              tabIndex: 0,
            }}
          >
            <div className="flex min-w-0 flex-col gap-2 px-1 pb-1">
              <PendingSurfaceNotices capabilityError={capabilityError} error={error} />
              {pending.map((interaction) => (
                <div
                  key={interaction.id}
                  hidden={interaction.id !== selected?.id}
                  data-attention-item={interaction.id}
                >
                  {(() => {
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
                      if (embedsQuestionSurface(interaction)) {
                        return (
                          <PendingA2UIResponse
                            key={interaction.id}
                            interaction={interaction}
                            rawSurface={rawSurface}
                            disabled={interactionDisabled}
                            onResponse={handleResponse}
                            onRefetchSurface={onRefetchSurfaces}
                            ownerLabel={ownerLabel}
                            showOwner={showOwner}
                            responseError={responseError}
                            actionLifecycle={
                              rawSurface ? actionLifecycles[rawSurface.id] : undefined
                            }
                          />
                        );
                      }
                      return (
                        <SurfaceQuestionNotice
                          disabled={interactionDisabled}
                          interaction={interaction}
                          key={interaction.id}
                          onRefetch={onRefetchSurfaces}
                          onOpen={onOpenSurfaceQuestion}
                          onResponse={handleResponse}
                          ownerLabel={ownerLabel}
                          showOwner={showOwner}
                          rawSurface={rawSurface}
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
                  })()}
                </div>
              ))}
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
