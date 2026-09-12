import type { Message as DomainMessage } from '@clio/core/v3';
import { AlertTriangleIcon, ArrowDownIcon, GitBranchIcon, LoaderCircleIcon } from 'lucide-react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';
import { useConversationDisplay } from '@/providers/conversation-display-provider';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { DeferredA2UISurface } from './conversation-message-blocks';
import { ClioTranscriptMinimap } from './transcript-minimap';
import type { ClioConversationProps } from './conversation-types';
import {
  isProjectedQuestionResumeEnvelope,
  mcpAppResponsesForMessages,
} from './conversation-message-projection';
import { PresentationNavigation } from './presentation-navigation';
import {
  useTranscriptReadingPosition,
  useTranscriptWidth,
  type TranscriptReadingAnchor,
} from './use-transcript-reading-position';

const VIRTUALIZATION_THRESHOLD = 80;
export type { ClioConversationProps, ConversationMessageRowProps } from './conversation-types';


function isProjectionOnlyA2UIMessage(message: DomainMessage): boolean {
  return (
    message.role === 'assistant' &&
    message.id.startsWith('msg_a2ui_') &&
    !message.turn_id &&
    message.blocks.every((block) => block.type === 'a2ui')
  );
}

import { ConversationMessageRow } from './conversation-message-row';

export function ClioConversation(props: ClioConversationProps) {
  return (
    <PresentationNavigation.Provider value={props}>
      <ConversationBody {...props} />
    </PresentationNavigation.Provider>
  );
}

function ConversationBody({
  messages: sourceMessages,
  loading,
  error,
  bottomInset = 0,
  ...entities
}: ClioConversationProps) {
  const mcpAppResponses = useMemo(
    () => mcpAppResponsesForMessages(sourceMessages),
    [sourceMessages],
  );
  const messages = useMemo(
    () =>
      sourceMessages.filter(
        (message) =>
          !isProjectionOnlyA2UIMessage(message) &&
          !isProjectedQuestionResumeEnvelope(message, entities.interactions),
      ),
    [entities.interactions, sourceMessages],
  );
  const { mode: defaultDisplayMode } = useConversationDisplay();
  const { conversationWidth } = useAppearancePreferences();
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollComplete = useRef(false);
  const pinnedToBottomRef = useRef(true);
  const readingAnchorRef = useRef<TranscriptReadingAnchor | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [activeMessageIndex, setActiveMessageIndex] = useState(0);
  const [turnDisplayModes, setTurnDisplayModes] = useState<Record<string, ConversationDisplayMode>>(
    {},
  );
  const setTurnDisplayMode = useCallback((messageId: string, mode: ConversationDisplayMode) => {
    setTurnDisplayModes((current) => ({ ...current, [messageId]: mode }));
  }, []);
  const referencedSurfaceIds = useMemo(
    () =>
      new Set(
        messages.flatMap((message) =>
          message.blocks.filter((block) => block.type === 'a2ui').map((block) => block.surface_id),
        ),
      ),
    [messages],
  );
  const activeMcpAppId = useMemo(
    () =>
      messages.flatMap((message) => message.blocks).findLast((block) => block.type === 'mcp_app')
        ?.app_instance_id,
    [messages],
  );
  const detachedSurfaces = useMemo(
    () =>
      Object.values(entities.surfaces)
        .filter((surface) => !referencedSurfaceIds.has(surface.id) && surface.state !== 'deleted')
        .sort((left, right) => left.revision - right.revision),
    [entities.surfaces, referencedSurfaceIds],
  );
  const activeStreamingIndex = messages.findLastIndex((message) =>
    message.blocks.some(
      (block) => (block.type === 'text' || block.type === 'reasoning') && block.streaming,
    ),
  );
  const virtualized = messages.length >= VIRTUALIZATION_THRESHOLD;
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: messages.length,
    estimateSize: () => 180,
    getScrollElement: () => scrollRef.current,
    overscan: 7,
    rangeExtractor: useCallback(
      (range) => {
        const indexes = defaultRangeExtractor(range);
        if (activeStreamingIndex >= 0 && !indexes.includes(activeStreamingIndex)) {
          indexes.push(activeStreamingIndex);
          indexes.sort((left, right) => left - right);
        }
        const anchorIndex = readingAnchorRef.current?.index;
        if (anchorIndex !== undefined && !indexes.includes(anchorIndex)) {
          indexes.push(anchorIndex);
          indexes.sort((left, right) => left - right);
        }
        return indexes;
      },
      [activeStreamingIndex],
    ),
  });
  const virtualRows = virtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows.at(-1);
  const virtualRangeKey = `${firstVirtualRow?.index ?? -1}:${firstVirtualRow?.start ?? -1}:${lastVirtualRow?.index ?? -1}:${lastVirtualRow?.end ?? -1}`;

  const {
    userScrollPendingRef,
    pointerScrollingRef,
    scrollIntentVersionRef,
    captureReadingAnchor,
    markUserScrollIntent,
    releasePointer,
  } = useTranscriptReadingPosition({
    messageCount: messages.length,
    setActiveMessageIndex,
    scrollRef,
    pinnedToBottomRef,
    readingAnchorRef,
    virtualized,
    virtualizer,
    virtualRangeKey,
  });

  const updateBottomState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const next = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    const userScrolling = pointerScrollingRef.current || userScrollPendingRef.current;
    userScrollPendingRef.current = false;
    if (userScrolling) {
      pinnedToBottomRef.current = next;
    }
    setIsAtBottom(pinnedToBottomRef.current && next);
    if (pinnedToBottomRef.current) {
      readingAnchorRef.current = null;
      setActiveMessageIndex(messages.length - 1);
      return;
    }
    const firstVisible = virtualizer
      .getVirtualItems()
      .find((item) => item.end >= element.scrollTop);
    if (firstVisible) setActiveMessageIndex(firstVisible.index);
    captureReadingAnchor();
  }, [
    messages.length,
    virtualizer,
    captureReadingAnchor,
    pointerScrollingRef,
    userScrollPendingRef,
  ]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ behavior, top: element.scrollHeight });
    pinnedToBottomRef.current = true;
    readingAnchorRef.current = null;
    setIsAtBottom(true);
  }, []);
  const jumpToMessage = useCallback(
    (index: number) => {
      const message = messages[index];
      if (!message) return;
      markUserScrollIntent();
      // A message landmark is a reading position, not a claim that the reader
      // reached the end of that message. This matters for a single tall turn,
      // such as a compaction summary: its only message is also the latest one,
      // but jumping to it must still move to the row's beginning.
      pinnedToBottomRef.current = false;
      readingAnchorRef.current = null;
      setIsAtBottom(false);
      setActiveMessageIndex(index);
      if (virtualized) virtualizer.scrollToIndex(index, { align: 'start' });
      else document.getElementById(`message-${message.id}`)?.scrollIntoView({ block: 'start' });
      window.requestAnimationFrame(() => {
        document.getElementById(`message-${message.id}`)?.focus({ preventScroll: true });
      });
    },
    [markUserScrollIntent, messages, virtualized, virtualizer],
  );

  const conversationViewportWidth = useTranscriptWidth({
    virtualized,
    scrollRef,
    pinnedToBottomRef,
    readingAnchorRef,
    scrollIntentVersionRef,
    virtualizer,
    scrollToLatest,
  });
  const minimapVisible = conversationViewportWidth >= 760;

  useLayoutEffect(() => {
    if (initialScrollComplete.current || messages.length === 0) return;
    initialScrollComplete.current = true;
    if (virtualized) {
      setActiveMessageIndex(messages.length - 1);
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    } else scrollToLatest('instant');
  }, [messages.length, scrollToLatest, virtualized, virtualizer]);

  useEffect(() => {
    let frame = 0;
    const focusSearchResult = () => {
      if (!window.location.hash.startsWith('#message-')) return;
      const target = window.location.hash.slice('#message-'.length);
      const [encodedMessageId, encodedActivityId] = target.split('/activity-', 2);
      const messageId = decodeURIComponent(encodedMessageId);
      const activityId = encodedActivityId ? decodeURIComponent(encodedActivityId) : undefined;
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      markUserScrollIntent();
      setIsAtBottom(false);
      virtualizer.scrollToIndex(index, { align: 'center' });
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          const activity = activityId ? document.getElementById(`tool-${activityId}`) : null;
          if (activity) {
            activity.scrollIntoView({ block: 'center' });
            activity.focus({ preventScroll: true });
          } else document.getElementById(`message-${messageId}`)?.focus({ preventScroll: true });
        });
      });
    };
    focusSearchResult();
    window.addEventListener('hashchange', focusSearchResult);
    return () => {
      window.removeEventListener('hashchange', focusSearchResult);
      window.cancelAnimationFrame(frame);
    };
  }, [messages, virtualizer, markUserScrollIntent]);

  useEffect(() => {
    if (!pinnedToBottomRef.current || messages.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      if (pinnedToBottomRef.current) scrollToLatest('instant');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, scrollToLatest]);

  useLayoutEffect(() => {
    if (!pinnedToBottomRef.current || messages.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      if (pinnedToBottomRef.current) scrollToLatest('instant');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bottomInset, messages.length, scrollToLatest]);

  return (
    <div className="relative h-full min-h-0">
      {messages.length > 0 ? (
        <ClioTranscriptMinimap
          activeIndex={activeMessageIndex}
          messages={messages}
          onJump={jumpToMessage}
          visible={minimapVisible}
        />
      ) : null}
      <div
        aria-label="Conversation"
        className="clio-scrollbar h-full overflow-y-auto overscroll-contain"
        data-minimap-visible={minimapVisible || undefined}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
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
          }
        }}
        onScroll={updateBottomState}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            pointerScrollingRef.current = true;
            markUserScrollIntent();
          }
        }}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onTouchMove={markUserScrollIntent}
        onWheel={markUserScrollIntent}
        ref={scrollRef}
        role="log"
        style={{ paddingBottom: bottomInset }}
        tabIndex={0}
      >
        {messages.length > 0 && loading ? (
          <div
            aria-live="polite"
            className="sticky top-2 z-20 mx-auto flex w-fit items-center gap-1.5 rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
            role="status"
          >
            <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin" />
            Syncing history…
          </div>
        ) : null}
        {messages.length === 0 && loading ? (
          <ConversationEmptyState
            aria-live="polite"
            className="h-full"
            description="Recovering messages, reasoning, tools, and artifacts from the agent."
            icon={<LoaderCircleIcon aria-hidden="true" className="size-7 animate-spin" />}
            title="Loading conversation"
          />
        ) : messages.length === 0 && error ? (
          <div className="grid h-full place-items-center p-5">
            <Alert className="max-w-xl" variant="destructive">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle>Conversation unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : messages.length === 0 ? (
          <ConversationEmptyState
            className="h-full"
            description="Send a message to begin. Live reasoning, tools, approvals, and artifacts will stay in causal order here."
            icon={<GitBranchIcon className="size-7" />}
            title="This session has no messages"
          />
        ) : (
          <div
            className={`${virtualized ? 'relative' : ''} mx-auto w-full ${conversationWidth === 'wide' ? 'max-w-6xl' : 'max-w-4xl'}`}
            style={virtualized ? { height: virtualizer.getTotalSize() } : undefined}
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
                  {...entities}
                  activeMcpAppId={activeMcpAppId}
                  displayMode={turnDisplayModes[message.id] ?? defaultDisplayMode}
                  index={index}
                  key={message.id}
                  measureElement={virtualizer.measureElement}
                  message={message}
                  mcpAppResponse={mcpAppResponses.get(message.id)}
                  onDisplayModeChange={(mode) => setTurnDisplayMode(message.id, mode)}
                  recent={index >= messages.length - 2}
                  start={start}
                  virtualized={virtualized}
                />
              );
            })}
          </div>
        )}
        {detachedSurfaces.length > 0 ? (
          <div
            className={`mx-auto grid w-full gap-4 px-5 pb-8 lg:px-8 ${conversationWidth === 'wide' ? 'max-w-6xl' : 'max-w-4xl'}`}
          >
            {detachedSurfaces.map((surface) => (
              <DeferredA2UISurface
                key={surface.id}
                onLocalAction={entities.onA2UILocalAction}
                surface={surface}
              />
            ))}
          </div>
        ) : null}
      </div>
      {!isAtBottom ? (
        <Button
          aria-label="Scroll to latest message"
          className="absolute right-3 rounded-full shadow-lg"
          onClick={() => scrollToLatest()}
          size="sm"
          style={{ bottom: bottomInset + 12 }}
          type="button"
          variant="outline"
        >
          <ArrowDownIcon aria-hidden="true" className="size-4" />
          Latest
        </Button>
      ) : null}
    </div>
  );
}
