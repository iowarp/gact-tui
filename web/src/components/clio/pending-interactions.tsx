import { useAttentionDraft } from './attention-drafts';
import type {
  A2UIActionLifecycle,
  A2UISurface,
  Artifact,
  PendingInteraction,
  PendingInteractionResponse,
} from '@clio/core/v3';
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { PermissionResponse } from './permission-response';
import { permissionTitle } from './permission-operation-labels';
import { AskPagerContext } from './ask-card-keys';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStableCallback } from '@/hooks/use-stable-callback';
import { handleScrollableRegionKeys } from '@/lib/scrollable-region-keys';
import { cn } from '@/lib/utils';
import {
  ATTENTION_REVEAL_EVENT,
  focusLost,
  isEmptyComposer,
  pendingInteractionDomId,
} from './interaction-control';
import { SurfaceQuestionNotice } from './surface-question-notice';
import { PendingA2UIResponse } from './pending-a2ui-response';
import { embedsQuestionSurface } from '@/lib/a2ui/question-navigation';
import { QuestionResponse } from './pending-interaction-question-response';
import { PendingSurfaceNotices } from './pending-interaction-notices';
import { PlanExitResponse } from './plan-exit-interaction';
import { planArtifact } from './plan-artifact';
import { plainQuestionText, questionPrompt } from './question-card-model';
import { plural, t } from '@lingui/core/macro';

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
  /** Opens the script a permission was asked from as a tab (its tool call's detail). */
  onOpenScript?: (interaction: PendingInteraction, callId: string) => void;
  /** The session's artifacts, so a plan card can open its saved plan. */
  artifacts?: Readonly<Record<string, Artifact>>;
  onOpenArtifact?: (artifact: Artifact) => void;
  /** Puts the caret back in the composer once the last card a person was in is answered. */
  onFocusComposer?: () => void;
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
  onOpenScript,
  artifacts = {},
  onOpenArtifact,
  onFocusComposer,
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
  const foundIndex = pending.findIndex((row) => row.id === selection.id);
  const index =
    foundIndex < 0 ? Math.min(selection.index, Math.max(0, pending.length - 1)) : foundIndex;
  const selected = pending[index];
  const selectedId = selected?.id;
  const viewportRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const docked = pending.length > 0 || Boolean(error) || Boolean(capabilityError);
  useLayoutEffect(() => {
    // The cap is 45% of the conversation, not of the window: publish its height to the dock.
    const dock = dockRef.current;
    const conversation = dock?.closest<HTMLElement>('[data-slot=session-transcript]');
    if (!dock || !conversation) return;
    const update = () =>
      dock.style.setProperty('--conversation-h', `${conversation.clientHeight}px`);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(conversation);
    return () => observer.disconnect();
  }, [docked]);
  useEffect(() => {
    // Synchronize the conversation-owned draft store with server removals.
    if (selectedId && (selection.id !== selectedId || selection.index !== index)) {
      setSelection({ id: selectedId, index });
    }
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [selectedId, index, selection.id, selection.index, setSelection]);
  // A new card takes focus when the composer is empty or nothing holds focus; while a person
  // types, Shift Tab from the composer reaches it instead. When the card they were in is
  // answered, focus moves to the next card, else back to the composer.
  const seenIds = useRef<ReadonlySet<string>>(new Set(pending.map((row) => row.id)));
  const pendingKey = pending.map((row) => row.id).join('\n');
  const focusInDock = useRef(false);
  const focusComposer = useStableCallback(() => onFocusComposer?.());
  useEffect(() => {
    const track = (event: FocusEvent) => {
      focusInDock.current = Boolean(
        event.target instanceof Node && dockRef.current?.contains(event.target),
      );
    };
    document.addEventListener('focusin', track);
    return () => document.removeEventListener('focusin', track);
  }, []);
  useEffect(() => {
    const ids = pendingKey ? pendingKey.split('\n') : [];
    const arrived = ids.some((id) => !seenIds.current.has(id));
    const departed = [...seenIds.current].some((id) => !ids.includes(id));
    seenIds.current = new Set(ids);
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    const card = selectedId
      ? document
          .getElementById(pendingInteractionDomId(selectedId))
          ?.closest<HTMLElement>('[data-slot="ask-card"]')
      : undefined;
    if (departed && focusInDock.current && (lost || !dockRef.current?.contains(active))) {
      focusInDock.current = false;
      if (card) card.focus({ preventScroll: true });
      else focusComposer();
      return;
    }
    if (!arrived || !card || !(lost || isEmptyComposer(active))) return;
    // Programmatic focus is not keyboard focus; Chromium would otherwise draw the focus edge.
    card.focus({ preventScroll: true, focusVisible: false });
  }, [pendingKey, selectedId, focusComposer]);
  useEffect(() => {
    const reveal = (event: Event) => {
      const id: unknown = (event as CustomEvent).detail;
      const next = pending.findIndex((row) => row.id === id);
      if (next >= 0) setSelection({ id: pending[next]!.id, index: next });
    };
    window.addEventListener(ATTENTION_REVEAL_EVENT, reveal);
    return () => window.removeEventListener(ATTENTION_REVEAL_EVENT, reveal);
  }, [pending, setSelection]);
  const navigate = (next: number) => {
    if (!pending[next]) return;
    setSelection({ id: pending[next]!.id, index: next });
  };
  const hasInteractiveSurface = selected?.kind === 'a2ui' || Boolean(selected?.source.surface_id);
  // The control that answered each card, so a failed answer hands focus back to
  // it once the card is enabled again rather than leaving focus on the page.
  const answeredFrom = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    for (const [id, control] of answeredFrom.current) {
      if (respondingIds.has(id)) continue;
      answeredFrom.current.delete(id);
      if (!responseErrors.has(id) || !focusLost()) continue;
      const usable =
        control.isConnected && !(control instanceof HTMLButtonElement && control.disabled);
      const card = document
        .getElementById(pendingInteractionDomId(id))
        ?.closest<HTMLElement>('[data-slot="ask-card"]');
      (usable ? control : card)?.focus({ preventScroll: true });
    }
  }, [respondingIds, responseErrors]);
  const handleResponse = useCallback(
    async (interaction: PendingInteraction, response: PendingInteractionResponse) => {
      if (responseInFlight.current.has(interaction.id)) return;
      responseInFlight.current.add(interaction.id);
      const active = document.activeElement;
      if (active instanceof HTMLElement && dockRef.current?.contains(active))
        answeredFrom.current.set(interaction.id, active);
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
  const pager = {
    index,
    total: pending.length,
    onPrevious: () => navigate(index - 1),
    onNext: () => navigate(index + 1),
  };

  return (
    <section
      ref={dockRef}
      aria-label={t`Agent needs your attention`}
      // A separate card docked 8px above the composer, at the composer's width.
      className="relative z-10 mx-auto mb-2 flex min-h-0 w-full max-w-4xl shrink flex-col"
      data-slot="pending-interactions"
      role="region"
    >
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {selected ? announcement(selected, index, pending.length) : ''}
      </p>
      <ScrollArea
        className={cn(
          'min-h-0 w-full shrink [&_[data-orientation=vertical]]:w-1.5 [&_[data-slot=scroll-area-scrollbar]]:opacity-50',
          // The card stops at 45% of the conversation's height, but never below 20rem (its
          // options grow with the interface size) nor past 75%. A visual answer gets more.
          hasInteractiveSurface
            ? 'max-h-[calc(100dvh-12rem)]'
            : 'max-h-[min(max(calc(var(--conversation-h,100dvh)*0.45),20rem),calc(var(--conversation-h,100dvh)*0.75))]',
        )}
        scrollHideDelay={500}
        // No scrollbar chrome at rest; it shows only while the card scrolls.
        type="scroll"
        viewportProps={{
          ref: viewportRef,
          'aria-label': plural(pending.length, {
            one: '# pending response',
            other: '# pending responses',
          }),
          className: 'pending-interactions-viewport overscroll-contain',
          onKeyDown: handleScrollableRegionKeys,
          // The sticky card header draws its hairline only while content is under it.
          onScroll: (event) =>
            event.currentTarget.toggleAttribute(
              'data-ask-scrolled',
              event.currentTarget.scrollTop > 0,
            ),
          role: 'region',
          tabIndex: -1,
        }}
      >
        <AskPagerContext.Provider value={pager}>
          <div
            className={cn(
              'flex min-w-0 flex-col gap-2',
              // A card past the cap scrolls its body; its options stay in view.
              !hasInteractiveSurface &&
                '[--ask-card-max:min(max(calc(var(--conversation-h,100dvh)*0.45),20rem),calc(var(--conversation-h,100dvh)*0.75))]',
            )}
          >
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
                        onOpenScript={onOpenScript}
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
                          actionLifecycle={rawSurface ? actionLifecycles[rawSurface.id] : undefined}
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
                        artifact={planArtifact(interaction, artifacts)}
                        disabled={interactionDisabled}
                        interaction={interaction}
                        key={interaction.id}
                        onOpenArtifact={onOpenArtifact}
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
        </AskPagerContext.Provider>
      </ScrollArea>
    </section>
  );
}

const KIND_NAMES: Record<string, string> = {
  permission: t`Permission`,
  question: t`Question`,
  a2ui: t`Question`,
  mcp_task_input: t`Input`,
};

/** The dock as the workspace mounts it: it renders again only when its props change. */
export const ClioPendingInteractionsDock = memo(ClioPendingInteractions);

/** Read once, politely: kind, title, why, place in the queue. */
function announcement(interaction: PendingInteraction, index: number, total: number): string {
  const kind =
    interaction.source.tool_name === 'plan_exit'
      ? t`Plan`
      : (KIND_NAMES[interaction.kind] ?? t`Request`);
  const why = interaction.payload?.access?.reason;
  // A question is announced by its words, not a generic "Question" title.
  const words =
    interaction.kind === 'question'
      ? plainQuestionText(questionPrompt(interaction))
      : interaction.kind === 'permission'
        ? permissionTitle(interaction)
        : interaction.title;
  const position = index + 1;
  return [
    t({
      message: `${kind}: ${words}`,
      comment: 'Screen-reader announcement: request kind, then its title',
    }),
    why,
    total > 1 ? t`${position} of ${total}` : undefined,
  ]
    .filter((sentence): sentence is string => Boolean(sentence))
    .reduce((text, sentence) =>
      // A title that already ends a sentence ("…flat-ndp?") takes no second stop.
      SENTENCE_END.test(text)
        ? t({
            message: `${text} ${sentence}`,
            comment:
              'Joins sentences of a screen-reader announcement when the first already ends in ? ! or .',
          })
        : t({
            message: `${text}. ${sentence}`,
            comment: 'Joins sentences of a screen-reader announcement',
          }),
    );
}

const SENTENCE_END = /[?!.。？！]\s*$/u;

function dropEntry<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}
