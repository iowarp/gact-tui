import { cn } from '@/lib/utils';
import type { QueryKey } from '@tanstack/react-query';
import { useQueryFetching } from '@/lib/query-notify';
import { useContext } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { TranscriptDisclosureContext } from './transcript-disclosure-context';
import { GitBranchIcon } from 'lucide-react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import {
  EarlierMessagesRow,
  TranscriptLoadError,
  TranscriptLoading,
  TRANSCRIPT_CONTROL_LANE_PX,
  TranscriptControlLane,
} from './transcript-inline-states';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { DeferredA2UISurface } from './conversation-message-blocks';
import { ClioCompactionProgress } from './conversation-summarization';
import { ClioTurnPreparation } from './turn-preparation';
import { ClioTurnWaitFeedback } from './turn-wait-feedback';
import { SessionResponseFeedback } from './goal-check-feedback';
import { placeCompactions } from './conversation-compaction-placement';
import { conversationModelBoundaries } from './conversation-model-boundaries';
import { TranscriptMessagesContext } from './transcript-messages-context';
import { ConversationForkCheckpoint } from './conversation-fork-checkpoint';
import { useSurfaceQuestionNavigation } from './use-surface-question-navigation';
import { ClioTranscriptOutline } from './transcript-outline';
import { useAttentionHighlights } from '@/hooks/use-attention-highlights';
import type { ClioConversationProps } from './conversation-types';
import {
  foldA2UIRevisionBlocks,
  conversationResponseContinuity,
  isProjectionOnlyA2UIMessage,
  isProjectedQuestionResumeEnvelope,
  mcpAppResponsesForMessages,
  projectA2UIActionMessages,
  surfaceAwaitsPendingResponse,
} from './conversation-message-projection';
import { PresentationNavigation, usePresentationNavigation } from './presentation-navigation';
import { TranscriptDisclosures } from './transcript-disclosures';
import { useTranscriptAutoscroll } from './use-transcript-autoscroll';
import { useConversationColumn } from './use-conversation-column';
import { useMcpAppLiveSet } from './mcp-app-live-set';
import { useTranscriptJumpLane } from './use-transcript-jump-lane';
import { useTranscriptSearchFocus } from './use-transcript-search-focus';
import { useVirtualizedRowsOverflow } from './use-virtualized-rows-overflow';
import {
  useTranscriptReadingPosition,
  useTranscriptWidth,
  type TranscriptReadingAnchor,
} from './use-transcript-reading-position';

const VIRTUALIZATION_THRESHOLD = 80;
const ESTIMATED_ROW_PX = 180;
export type { ClioConversationProps, ConversationMessageRowProps } from './conversation-types';

import { ConversationMessageRow } from './conversation-message-row';
import { placeDeliveredFeedback } from './conversation-feedback';
import { canGroupUserMessages } from './conversation-user-group';
import { placeHarnessInjections } from './conversation-injection-placement';
import {
  foldSubagentReturns,
  placeContinuedActivity,
  liveActivityIterationId,
} from './conversation-activity-placement';
import { loadMarkdownText } from '@/components/ai-elements/markdown-text-loader';

// Message text reflows once the markdown renderer arrives; request it with the
// transcript instead of after the first rows mount, so the tail paints formatted.
void loadMarkdownText();

/** Within this distance of the top, a paged transcript reads its next older page. */
const EARLIER_LOAD_THRESHOLD_PX = 600;

export function ClioConversation(props: ClioConversationProps) {
  const inRouter = useInRouterContext();
  const navigation = usePresentationNavigation(props);
  return (
    <PresentationNavigation.Provider value={navigation}>
      <TranscriptDisclosures sessionId={props.sessionId ?? props.messages[0]?.session_id}>
        <TranscriptMessagesContext.Provider value={props.messages}>
          {inRouter ? <RoutedConversationBody {...props} /> : <ConversationBody {...props} />}
        </TranscriptMessagesContext.Provider>
      </TranscriptDisclosures>
    </PresentationNavigation.Provider>
  );
}

/**
 * The lane above the composer, shown while the reader is away from the latest
 * message or the history is refreshing. A refresh sits in the lane at row
 * height, so it never covers a message or moves the reading position.
 */
function TranscriptControls({
  loading,
  onJump,
  queryKey,
}: {
  loading?: boolean;
  onJump?: () => void;
  queryKey?: QueryKey;
}) {
  const fetching = useQueryFetching(queryKey);
  const syncing = Boolean(loading || fetching);
  return syncing || onJump ? <TranscriptControlLane onJump={onJump} syncing={syncing} /> : null;
}
function RoutedConversationBody(props: ClioConversationProps) {
  const location = useLocation();
  return <ConversationBody {...props} searchHash={location.hash} searchKey={location.key} />;
}

function ConversationBody({
  messages: sourceMessages,
  loading,
  loadingQueryKey,
  awaitingFirstPage,
  error,
  onReload,
  earlier,
  bottomInset = 0,
  compactions,
  preparation,
  searchHash,
  searchKey,
  ...entities
}: ClioConversationProps & { searchHash?: string; searchKey?: string }) {
  const mcpAppResponses = useMemo(
    () => mcpAppResponsesForMessages(sourceMessages),
    [sourceMessages],
  );
  const projectedMessages = useMemo(
    () =>
      foldSubagentReturns(
        foldA2UIRevisionBlocks(
          projectA2UIActionMessages(
            sourceMessages.filter(
              (message) =>
                !isProjectionOnlyA2UIMessage(message) &&
                !isProjectedQuestionResumeEnvelope(message, entities.interactions),
            ),
          ),
        ),
      ),
    [entities.interactions, sourceMessages],
  );
  const { messages, feedback } = useMemo(
    () => placeDeliveredFeedback(projectedMessages),
    [projectedMessages],
  );
  const responseContinuity = useMemo(
    () => conversationResponseContinuity(messages, entities.tools, entities.processes),
    [messages, entities.tools, entities.processes],
  );
  const injectionPlacement = useMemo(() => placeHarnessInjections(messages), [messages]);
  const compactionPlacement = useMemo(
    () => placeCompactions(compactions ?? [], messages),
    [compactions, messages],
  );
  const modelBoundaries = useMemo(() => conversationModelBoundaries(messages), [messages]);
  const { conversationWidth } = useAppearancePreferences();
  const scrollRef = useRef<HTMLDivElement>(null);
  const disclosure = useContext(TranscriptDisclosureContext);
  const revealDisclosure = disclosure?.setOpen;
  const initialScrollComplete = useRef(false);
  const autoscroll = useTranscriptAutoscroll(scrollRef);
  const { followingRef, scrollToBottom, disengage } = autoscroll;
  const readingAnchorRef = useRef<TranscriptReadingAnchor | null>(null);
  const [activeMessageIndex, setActiveMessageIndex] = useState(0);
  const [turnDisplayModes, setTurnDisplayModes] = useState<Record<string, ConversationDisplayMode>>(
    {},
  );
  const setTurnDisplayMode = useCallback((messageId: string, mode: ConversationDisplayMode) => {
    setTurnDisplayModes((current) =>
      current[messageId] === mode ? current : { ...current, [messageId]: mode },
    );
  }, []);
  const activityPlacement = useMemo(
    () =>
      placeContinuedActivity(
        messages,
        responseContinuity.continuations,
        entities.tools,
        entities.tasks,
        feedback,
        injectionPlacement.before,
        new Set([
          ...modelBoundaries.keys(),
          ...Object.keys(turnDisplayModes).filter((id) => turnDisplayModes[id] === 'full'),
          ...compactionPlacement.byMessage.keys(),
        ]),
      ),
    [
      messages,
      responseContinuity,
      entities.tools,
      entities.tasks,
      feedback,
      injectionPlacement,
      modelBoundaries,
      turnDisplayModes,
      compactionPlacement,
    ],
  );
  const referencedSurfaceIds = useMemo(
    () =>
      new Set(
        messages.flatMap((message) =>
          message.blocks.filter((block) => block.type === 'a2ui').map((block) => block.surface_id),
        ),
      ),
    [messages],
  );
  // A reopened session that is already waiting has no turn.started event yet;
  // its run is the latest prompt's, as currentTurnAssistantMessages assumes.
  const sessionLive = ['running', 'queued', 'waiting_permission', 'waiting_user'].includes(
    preparation?.sessionState ?? '',
  );
  const latestPrompt = messages.findLast((message) => message.role === 'user');
  const activeRunId = sessionLive
    ? (preparation?.activeTurnId ?? latestPrompt?.run_id ?? latestPrompt?.turn_id)
    : undefined;
  const liveActivityId = useMemo(
    () =>
      liveActivityIterationId({
        messages,
        activeTurnId: preparation?.activeTurnId,
        sessionState: preparation?.sessionState,
        presentations: activityPlacement,
        tools: entities.tools,
        tasks: entities.tasks,
        feedback,
        injections: injectionPlacement.before,
      }),
    [
      messages,
      preparation?.activeTurnId,
      preparation?.sessionState,
      activityPlacement,
      entities.tools,
      entities.tasks,
      feedback,
      injectionPlacement.before,
    ],
  );
  useMcpAppLiveSet(entities.sessionId, messages, entities.mcpAppRepository);
  const detachedSurfaces = useMemo(
    () =>
      Object.values(entities.surfaces)
        .filter(
          (surface) =>
            !referencedSurfaceIds.has(surface.id) &&
            surface.state !== 'deleted' &&
            // The pending-response tray renders a surface awaiting the user's
            // answer; a detached copy here would mount the same surface twice.
            !surfaceAwaitsPendingResponse(entities.interactions, surface.id),
        )
        .sort((left, right) => left.revision - right.revision),
    [entities.interactions, entities.surfaces, referencedSurfaceIds],
  );
  const activeStreamingIndex = messages.findLastIndex((message) =>
    message.blocks.some(
      (block) => (block.type === 'text' || block.type === 'reasoning') && block.streaming,
    ),
  );
  const activeStreamingMessageId = messages[activeStreamingIndex]?.id;
  const activeActivityIndex = activeStreamingMessageId
    ? messages.findIndex((message) =>
        activityPlacement
          .get(message.id)
          ?.iterations.some((iteration) =>
            iteration.id.startsWith(`${activeStreamingMessageId}:iteration:`),
          ),
      )
    : -1;
  // A paged transcript is a window onto a longer history: mount only its
  // visible tail instead of laying out the whole first page. Latched so the
  // last older page does not switch every row back into the document flow.
  const [paged, setPaged] = useState(Boolean(earlier?.hasEarlier));
  if (earlier?.hasEarlier && !paged) setPaged(true);
  const virtualized = messages.length >= VIRTUALIZATION_THRESHOLD || paged;
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: messages.length,
    // Attach once rows exist, starting from the estimated tail, so the first
    // rows mounted are the ones the initial scroll-to-end reveals.
    enabled: messages.length > 0,
    initialOffset: () => Math.max(0, messages.length * ESTIMATED_ROW_PX - window.innerHeight),
    initialRect: { width: 0, height: window.innerHeight },
    // Height corrections can scroll during commit; let React batch the range
    // update instead of trying to flush another render inside that commit.
    useFlushSync: false,
    estimateSize: () => ESTIMATED_ROW_PX,
    getScrollElement: () => scrollRef.current,
    overscan: 7,
    rangeExtractor: useCallback(
      (range) => {
        const indexes = defaultRangeExtractor(range);
        for (const index of [activeStreamingIndex, activeActivityIndex]) {
          if (index >= 0 && !indexes.includes(index)) indexes.push(index);
        }
        const anchor = readingAnchorRef.current;
        // Persisted history may prepend rows after a live message was selected.
        // Its durable identity remains authoritative when its index changes.
        const anchorIndex = anchor
          ? messages.findIndex((message) => `message-${message.id}` === anchor.id)
          : -1;
        if (anchorIndex >= 0 && !indexes.includes(anchorIndex)) {
          indexes.push(anchorIndex);
          indexes.sort((left, right) => left - right);
        }
        return indexes.sort((left, right) => left - right);
      },
      [activeActivityIndex, activeStreamingIndex, messages],
    ),
  });
  const virtualRows = virtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows.at(-1);
  const virtualRangeKey = `${firstVirtualRow?.index ?? -1}:${firstVirtualRow?.start ?? -1}:${lastVirtualRow?.index ?? -1}:${lastVirtualRow?.end ?? -1}`;

  const { messagesContainerRef, virtualizedRowsOverflow } = useVirtualizedRowsOverflow({
    messageCount: messages.length,
    virtualized,
    virtualizer,
    virtualRangeKey,
  });

  const { scrollIntentVersionRef, captureReadingAnchor, markUserScrollIntent } =
    useTranscriptReadingPosition({
      messageCount: messages.length,
      setActiveMessageIndex,
      scrollRef,
      pinnedToBottomRef: followingRef,
      readingAnchorRef,
      virtualized,
      virtualizer,
      virtualRangeKey,
    });

  const onAutoscroll = autoscroll.onScroll;
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    onAutoscroll();
    // Reaching the top of a paged transcript reads its next older page.
    if (earlier?.hasEarlier && !earlier.loading && element.scrollTop < EARLIER_LOAD_THRESHOLD_PX)
      earlier.load();
    if (followingRef.current) {
      readingAnchorRef.current = null;
      setActiveMessageIndex(messages.length - 1);
      return;
    }
    const firstVisible = virtualizer
      .getVirtualItems()
      .find((item) => item.end >= element.scrollTop);
    if (firstVisible) setActiveMessageIndex(firstVisible.index);
    // Layout scrolls after expanding a disclosure must retain its exact row.
    // New wheel/key/pointer navigation clears the anchor before this handler.
    if (!readingAnchorRef.current?.disclosure) captureReadingAnchor();
  }, [messages.length, virtualizer, captureReadingAnchor, onAutoscroll, followingRef, earlier]);

  const jumpToMessage = useCallback(
    (index: number) => {
      const message = messages[index];
      if (!message) return;
      markUserScrollIntent();
      // A message landmark is a reading position, not a claim that the reader
      // reached the end of that message. This matters for a single tall turn,
      // such as a compaction summary: its only message is also the latest one,
      // but jumping to it must still move to the row's beginning.
      disengage();
      setActiveMessageIndex(index);
      if (virtualized) virtualizer.scrollToIndex(index, { align: 'start' });
      else document.getElementById(`message-${message.id}`)?.scrollIntoView({ block: 'start' });
      window.requestAnimationFrame(() => {
        document.getElementById(`message-${message.id}`)?.focus({ preventScroll: true });
      });
    },
    [disengage, markUserScrollIntent, messages, virtualized, virtualizer],
  );

  useAttentionHighlights(
    scrollRef,
    entities.attentionData,
    messages,
    entities.tools,
    entities.attentionView,
  );
  useSurfaceQuestionNavigation({
    messages,
    sessionId: entities.sessionId,
    scrollRef,
    jumpToMessage,
  });

  const conversationViewportWidth = useTranscriptWidth({
    virtualized,
    scrollRef,
    pinnedToBottomRef: followingRef,
    readingAnchorRef,
    scrollIntentVersionRef,
    virtualizer,
  });
  // The outline button floats at the top left; once the column fills the
  // viewport, a gutter keeps the text from scrolling under it.
  const outlineGutter =
    (conversationViewportWidth - (conversationWidth === 'wide' ? 1152 : 896)) / 2 < 32;
  useConversationColumn(scrollRef, conversationWidth === 'wide' ? 1152 : 896);

  useLayoutEffect(() => {
    if (initialScrollComplete.current || messages.length === 0) return;
    initialScrollComplete.current = true;
    if (virtualized) {
      setActiveMessageIndex(messages.length - 1);
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    } else scrollToBottom('instant');
  }, [messages.length, scrollToBottom, virtualized, virtualizer]);

  useTranscriptSearchFocus({
    messages,
    virtualizer,
    scrollRef,
    markUserScrollIntent,
    disengage,
    revealDisclosure,
    searchHash,
    searchKey,
    setTurnDisplayMode,
  });

  // Streamed deltas and a changed composer inset follow before paint while
  // engaged; the autoscroll hook's ResizeObserver catches later layout growth.
  useLayoutEffect(() => {
    if (followingRef.current && messages.length > 0) scrollToBottom('instant');
  }, [bottomInset, messages, scrollToBottom, followingRef]);

  const { jumpVisible, holdPress } = useTranscriptJumpLane({
    engaged: autoscroll.engaged,
    adrift: autoscroll.adrift,
    scrollable: autoscroll.scrollable,
    hasMessages: messages.length > 0,
    scrollRef,
    captureReadingAnchor,
  });

  // An empty list is only "no messages" once the transcript actually arrived.
  // A load error outranks everything, including a running turn's preparation.
  const turnStarting =
    preparation?.sessionState === 'queued' || preparation?.sessionState === 'running';
  const emptyFetching = useQueryFetching(loadingQueryKey, messages.length === 0);
  const emptyTranscript =
    messages.length > 0
      ? null
      : error
        ? 'error'
        : awaitingFirstPage || ((loading || emptyFetching) && !turnStarting)
          ? 'loading'
          : turnStarting
            ? 'preparing'
            : 'empty';

  return (
    <div className="relative h-full min-h-0">
      {messages.length > 0 ? (
        <ClioTranscriptOutline
          activeIndex={activeMessageIndex}
          attention={entities.attentionData}
          messages={messages}
          markedMessageIds={entities.markedMessageIds}
          markingMessageId={entities.markingMessageId}
          onMarkMessage={entities.onMarkMessage}
          onJump={jumpToMessage}
        />
      ) : null}
      {/* `overflow-anchor: none`: the virtualizer and the autoscroll hook own
          scroll position here. With the browser's own scroll anchoring on, it
          picked an anchor near the bottom and, each time the virtualizer
          re-positioned rows, silently moved the reader back to the bottom right
          after they scrolled up, even on a finished conversation. */}
      <div
        aria-label="Conversation"
        className={cn(
          'clio-scrollbar h-full overflow-y-auto overscroll-contain [overflow-anchor:none]',
          outlineGutter && 'pl-3',
        )}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (['Enter', ' '].includes(event.key) && target.closest('button[aria-expanded]')) {
            markUserScrollIntent();
            disengage();
            captureReadingAnchor(target);
          }
          const ownsKey = target.closest(
            'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="tablist"], [role="radiogroup"]',
          );
          if (
            !event.defaultPrevented &&
            !ownsKey &&
            !(event.key === ' ' && target.closest('button, [role="button"]')) &&
            ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(event.key)
          ) {
            // Native navigation keys also scroll when a plain transcript
            // button has focus. That reading intent must survive a resize.
            markUserScrollIntent();
            autoscroll.onScrollKey(event);
          }
        }}
        onScroll={handleScroll}
        onPointerDown={(event) => {
          const disclosure =
            event.target instanceof Element ? event.target.closest('button[aria-expanded]') : null;
          if (disclosure) {
            if (autoscroll.engaged) {
              holdPress(disclosure);
            }
            markUserScrollIntent();
            disengage();
            // A streaming row can finish before a native scroll event fires.
            // Keep the visible reader anchor mounted through that transition.
            captureReadingAnchor(disclosure);
          }
          if (event.target === event.currentTarget) markUserScrollIntent();
          autoscroll.onPointerDown(event);
        }}
        onTouchStart={autoscroll.onTouchStart}
        onTouchMove={(event) => {
          markUserScrollIntent();
          autoscroll.onTouchMove(event);
        }}
        onTouchEnd={autoscroll.onTouchEnd}
        onTouchCancel={autoscroll.onTouchEnd}
        onWheel={(event) => {
          markUserScrollIntent();
          autoscroll.onWheel(event);
        }}
        ref={scrollRef}
        role="log"
        style={{
          paddingBottom: bottomInset,
          scrollPaddingBottom: bottomInset + (jumpVisible ? TRANSCRIPT_CONTROL_LANE_PX : 0),
        }}
        tabIndex={0}
      >
        {emptyTranscript === 'error' && error ? (
          <TranscriptLoadError error={error} onRetry={onReload} />
        ) : emptyTranscript === 'loading' ? (
          <TranscriptLoading />
        ) : emptyTranscript === 'preparing' ? null : emptyTranscript === 'empty' ? (
          <>
            {entities.forkOrigin?.message_count === 0 ? (
              <div className="mx-auto max-w-4xl px-(--conversation-gutter)">
                <ConversationForkCheckpoint
                  origin={entities.forkOrigin}
                  workspaceId={entities.workspaceId}
                />
              </div>
            ) : null}
            <ConversationEmptyState
              className="h-full"
              description="Send a message to begin. Live reasoning, tools, approvals, and artifacts will stay in causal order here."
              icon={<GitBranchIcon className="size-7" />}
              title="This session has no messages"
            />
          </>
        ) : (
          <>
            {earlier && (earlier.hasEarlier || earlier.loading || earlier.error) ? (
              <EarlierMessagesRow
                className={conversationWidth === 'wide' ? 'max-w-6xl' : 'max-w-4xl'}
                earlier={earlier}
              />
            ) : null}
            <div
              ref={(node) => {
                autoscroll.observeContent(node);
                messagesContainerRef.current = node;
              }}
              data-slot="transcript-column"
              className={`${virtualized ? 'relative' : ''} mx-auto w-full ${conversationWidth === 'wide' ? 'max-w-6xl' : 'max-w-4xl'}`}
              style={
                virtualized
                  ? { height: virtualizer.getTotalSize() + virtualizedRowsOverflow }
                  : undefined
              }
            >
              {(virtualized
                ? virtualRows.map((virtualRow) => ({
                    index: virtualRow.index,
                    start: virtualRow.start,
                  }))
                : messages.map((_, index) => ({ index, start: undefined }))
              ).map(({ index, start }) => {
                const message = messages[index];
                if (!message) return null;
                return (
                  <ConversationMessageRow
                    liveActivityId={liveActivityId}
                    feedbackMessages={feedback.get(message.id)}
                    injectionMessages={injectionPlacement.before.get(message.id)}
                    injectionsGrouped={injectionPlacement.grouped.has(message.id)}
                    responseContinued={responseContinuity.continued.has(message.id)}
                    responseContinuation={responseContinuity.continuations.has(message.id)}
                    userContinuation={
                      canGroupUserMessages(messages[index - 1], message) &&
                      !modelBoundaries.has(message.id)
                    }
                    userContinued={Boolean(
                      messages[index + 1] &&
                        canGroupUserMessages(message, messages[index + 1]) &&
                        !modelBoundaries.has(messages[index + 1].id),
                    )}
                    turnPresentation={activityPlacement.get(message.id)}
                    active={
                      Boolean(activeRunId) && (message.run_id ?? message.turn_id) === activeRunId
                    }
                    {...entities}
                    displayMode={turnDisplayModes[message.id] ?? 'chain'}
                    index={index}
                    key={message.id}
                    measureElement={virtualizer.measureElement}
                    message={message}
                    mcpAppResponse={mcpAppResponses.get(message.id)}
                    messageCompactions={compactionPlacement.byMessage.get(message.id)}
                    modelBoundary={modelBoundaries.get(message.id)}
                    onDisplayModeChange={(mode) => setTurnDisplayMode(message.id, mode)}
                    recent={index >= messages.length - 2}
                    start={start}
                    virtualized={virtualized}
                  />
                );
              })}
            </div>
          </>
        )}
        {preparation && emptyTranscript !== 'error' && emptyTranscript !== 'loading' ? (
          <div
            className={`mx-auto w-full px-(--conversation-gutter) ${conversationWidth === 'wide' ? 'max-w-6xl' : 'max-w-4xl'}`}
            ref={autoscroll.observeContent}
          >
            <ClioTurnPreparation {...preparation} messages={sourceMessages} />
            <SessionResponseFeedback sessionId={entities.sessionId}>
              <ClioTurnWaitFeedback
                {...preparation}
                messages={sourceMessages}
                tools={entities.tools}
                tasks={entities.tasks}
                subagents={entities.subagents}
                awaitingUser={entities.interactions?.some(
                  (interaction) => interaction.status === 'pending',
                )}
              />
            </SessionResponseFeedback>
          </div>
        ) : null}
        {compactionPlacement.trailing.length > 0 ? (
          <div
            className={`mx-auto grid w-full gap-3 px-(--conversation-gutter) pb-4 ${conversationWidth === 'wide' ? 'max-w-6xl' : 'max-w-4xl'}`}
            data-slot="trailing-compactions"
            ref={autoscroll.observeContent}
          >
            {compactionPlacement.trailing.map((compaction) => (
              <ClioCompactionProgress compaction={compaction} key={compaction.compaction_id} />
            ))}
          </div>
        ) : null}
        {detachedSurfaces.length > 0 ? (
          <div
            ref={autoscroll.observeContent}
            className={`mx-auto grid w-full gap-4 px-(--conversation-gutter) pb-8 ${conversationWidth === 'wide' ? 'max-w-6xl' : 'max-w-4xl'}`}
          >
            {detachedSurfaces.map((surface) => (
              <DeferredA2UISurface
                actionLifecycle={entities.actionLifecycles?.[surface.id]}
                key={surface.id}
                surface={surface}
              />
            ))}
          </div>
        ) : null}
        {messages.length > 0 ? (
          <TranscriptControls
            loading={loading}
            onJump={jumpVisible ? autoscroll.engage : undefined}
            queryKey={loadingQueryKey}
          />
        ) : null}
      </div>
    </div>
  );
}
