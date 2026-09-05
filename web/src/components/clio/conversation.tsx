import type { PendingInteraction, Message as DomainMessage } from '@clio/core/v3';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  BrainCircuitIcon,
  BotIcon,
  CopyIcon,
  EyeIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import { m } from 'motion/react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from '@/components/ai-elements/message';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';
import { useConversationDisplay } from '@/providers/conversation-display-provider';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { ClioMessageHistoryActions } from './message-history-actions';
import { DeferredA2UISurface, MessageBlockSequence } from './conversation-message-blocks';
import { ConversationTurn } from './conversation-turn';
import { useConversationTurn } from './use-conversation-turn';
import { subagentsForTool } from './subagent-tool-link';
import { ClioTranscriptMinimap } from './transcript-minimap';
import type { ClioConversationProps, ConversationMessageRowProps } from './conversation-types';
import {
  isProjectedQuestionResumeEnvelope,
  mcpAppResponsesForMessages,
} from './conversation-message-projection';
import { McpAppResponseMessageRow } from './conversation-message-projections';

const VIRTUALIZATION_THRESHOLD = 80;
export type { ClioConversationProps, ConversationMessageRowProps } from './conversation-types';

const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  index,
  start,
  recent,
  measureElement,
  virtualized = false,
  displayMode,
  onDisplayModeChange,
  mcpAppResponse,
  ...entities
}: ConversationMessageRowProps) {
  const canRetry =
    message.role === 'assistant' &&
    (message.blocks.length === 0 ||
      message.blocks.some((block) => block.type === 'error' && block.recoverable));
  const retrying = entities.retryingMessageId === message.id;
  const pendingSteer = message.role === 'user' && entities.pendingMessageIds?.has(message.id);
  const cancellablePendingSteer =
    pendingSteer && entities.cancellablePendingMessageIds?.has(message.id);
  const turn = useConversationTurn(message, entities.tools, entities.tasks, entities.subagents);
  const { linkedSubagentIds, residualBlocks } = turn;

  if (mcpAppResponse) {
    return (
      <McpAppResponseMessageRow
        index={index}
        measureElement={measureElement}
        messageId={message.id}
        recent={recent}
        response={mcpAppResponse}
        start={start}
        virtualized={virtualized}
      />
    );
  }
  const actions = (
    <MessageActions className="ml-auto shrink-0 opacity-100 sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
      {cancellablePendingSteer ? (
        <MessageAction
          disabled={
            entities.cancellingPendingMessageId === message.id || !entities.onCancelPendingSteer
          }
          label={
            entities.cancellingPendingMessageId === message.id
              ? 'Cancelling pending message'
              : 'Cancel pending message'
          }
          onClick={() => void entities.onCancelPendingSteer?.(message.id)}
          tooltip={
            entities.cancellingPendingMessageId === message.id
              ? 'Cancelling pending message'
              : 'Cancel before delivery'
          }
        >
          {entities.cancellingPendingMessageId === message.id ? (
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <XIcon aria-hidden="true" className="size-3.5" />
          )}
        </MessageAction>
      ) : null}
      {canRetry ? (
        <MessageAction
          disabled={retrying || !entities.onRetryMessage}
          label={retrying ? 'Retrying response' : 'Retry response'}
          onClick={() => void entities.onRetryMessage?.(message.id)}
          tooltip={retrying ? 'Retrying response' : 'Retry response'}
        >
          {retrying ? (
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <RotateCcwIcon aria-hidden="true" className="size-3.5" />
          )}
        </MessageAction>
      ) : null}
      <ClioMessageHistoryActions
        forking={entities.forkingMessageId === message.id}
        onFork={
          entities.onForkFromMessage ? () => entities.onForkFromMessage?.(message.id) : undefined
        }
        onRewind={
          entities.onRewindToMessage ? () => entities.onRewindToMessage?.(message.id) : undefined
        }
        rewinding={entities.rewindingMessageId === message.id}
      />
      <MessageAction
        label="Copy message"
        onClick={() =>
          void copyText(
            message.blocks
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join('\n'),
          )
        }
        tooltip="Copy message"
      >
        <CopyIcon aria-hidden="true" className="size-3.5" />
      </MessageAction>
    </MessageActions>
  );

  return (
    <div
      className={`${virtualized ? 'absolute left-0 top-0' : 'relative'} w-full px-5 pb-4 pt-1 outline-none target:rounded-xl target:ring-2 target:ring-primary/50 lg:px-8`}
      data-index={index}
      id={`message-${message.id}`}
      ref={measureElement}
      style={virtualized ? { transform: `translateY(${start ?? 0}px)` } : undefined}
      tabIndex={-1}
    >
      <m.div
        animate={{ opacity: 1 }}
        initial={{ opacity: recent ? 0 : 1 }}
        transition={{ duration: 0.16 }}
      >
        <Message from={message.role === 'unknown' ? 'system' : message.role}>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {message.role === 'user' ? (
              <UserIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <BotIcon aria-hidden="true" className="size-3.5 text-primary" />
            )}
            <span>
              {message.role === 'user'
                ? 'You'
                : message.role === 'assistant'
                  ? brand.name
                  : message.role === 'system'
                    ? 'System'
                    : 'Unknown sender'}
            </span>
            <time className="font-mono text-[10px]" dateTime={message.created_at}>
              {new Date(message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            {message.role === 'assistant' && turn.iterations.length > 0 ? (
              <ToggleGroup
                aria-label="Activity detail"
                className="ml-1 overflow-hidden rounded-md"
                onValueChange={(value) => {
                  if (value === 'chain' || value === 'full') onDisplayModeChange(value);
                }}
                size="sm"
                spacing={0}
                type="single"
                value={displayMode}
                variant="outline"
              >
                <ToggleGroupItem
                  aria-label="Chain view"
                  className="h-6 min-w-6 rounded-none px-1.5"
                  title="Chain view"
                  value="chain"
                >
                  <BrainCircuitIcon aria-hidden="true" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  aria-label="Full activity view"
                  className="h-6 min-w-6 rounded-none px-1.5"
                  title="Full activity view"
                  value="full"
                >
                  <EyeIcon aria-hidden="true" />
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
            {actions}
          </div>
          <MessageContent
            className={cn(
              pendingSteer &&
                'rounded-xl border border-dashed border-primary/60 bg-primary/[0.025] transition-[border-color,background-color] duration-150',
            )}
          >
            {message.blocks.length === 0 && message.role === 'assistant' ? (
              <Alert variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertTitle>Response unavailable</AlertTitle>
                <AlertDescription>
                  No response content was recorded for this turn. You can retry the response.
                </AlertDescription>
              </Alert>
            ) : message.role === 'assistant' && turn.iterations.length > 0 ? (
              <>
                <ConversationTurn
                  activeMcpAppId={entities.activeMcpAppId}
                  artifacts={entities.artifacts}
                  interactions={entities.interactions}
                  iterations={turn.iterations}
                  mcpAppRepository={entities.mcpAppRepository}
                  messageSessionId={message.session_id}
                  mode={displayMode}
                  onOpenSubagent={entities.onOpenSubagent}
                  onOpenArtifact={entities.onOpenArtifact}
                  onInteractionResponse={entities.onInteractionResponse}
                  subagents={entities.subagents}
                />
                <MessageBlockSequence
                  blocks={residualBlocks.filter(
                    (block) =>
                      block.type !== 'subagent' || !linkedSubagentIds.has(block.subagent_id),
                  )}
                  messageSessionId={message.session_id}
                  resourcesFirst={message.role === 'user'}
                  {...entities}
                />
              </>
            ) : (
              <MessageBlockSequence
                blocks={message.blocks}
                messageSessionId={message.session_id}
                resourcesFirst={message.role === 'user'}
                {...entities}
              />
            )}
          </MessageContent>
        </Message>
      </m.div>
    </div>
  );
}, conversationMessageRowPropsEqual);

interface MessageEntityRefs {
  artifacts: Set<string>;
  subagents: Set<string>;
  surfaces: Set<string>;
  tasks: Set<string>;
  tools: Set<string>;
  resources: Set<string>;
}

const messageEntityRefsCache = new WeakMap<DomainMessage, MessageEntityRefs>();

function messageEntityRefs(message: DomainMessage): MessageEntityRefs {
  const cached = messageEntityRefsCache.get(message);
  if (cached) return cached;
  const refs: MessageEntityRefs = {
    artifacts: new Set(),
    subagents: new Set(),
    surfaces: new Set(),
    tasks: new Set(),
    tools: new Set(),
    resources: new Set(),
  };
  for (const block of message.blocks) {
    if (block.type === 'artifact') refs.artifacts.add(block.artifact_id);
    else if (block.type === 'subagent') refs.subagents.add(block.subagent_id);
    else if (block.type === 'a2ui') refs.surfaces.add(block.surface_id);
    else if (block.type === 'task') refs.tasks.add(block.task_id);
    else if (block.type === 'tool') refs.tools.add(block.tool_id);
    else if (block.type === 'resource') refs.resources.add(block.resource_id);
  }
  messageEntityRefsCache.set(message, refs);
  return refs;
}

function referencedRowsEqual<T>(
  left: Record<string, T>,
  right: Record<string, T>,
  ids: ReadonlySet<string>,
): boolean {
  for (const id of ids) {
    if (left[id] !== right[id]) return false;
  }
  return true;
}

function linkedSubagentsEqual(
  left: ConversationMessageRowProps,
  right: ConversationMessageRowProps,
  toolIds: ReadonlySet<string>,
): boolean {
  for (const toolId of toolIds) {
    const leftRows = subagentsForTool(left.tools[toolId], left.subagents);
    const rightRows = subagentsForTool(right.tools[toolId], right.subagents);
    if (
      leftRows.length !== rightRows.length ||
      leftRows.some((row, index) => row !== rightRows[index])
    ) {
      return false;
    }
  }
  return true;
}

// The memo boundary's equality check is exported for a direct regression test:
// every callback prop the row closes over must be enumerated here, or a fresh
// callback the app passed down is silently discarded for a stale one.
// oxlint-disable-next-line react/only-export-components
export function conversationMessageRowPropsEqual(
  left: ConversationMessageRowProps,
  right: ConversationMessageRowProps,
): boolean {
  if (
    left.message !== right.message ||
    left.displayMode !== right.displayMode ||
    left.index !== right.index ||
    left.start !== right.start ||
    left.recent !== right.recent ||
    left.measureElement !== right.measureElement ||
    left.virtualized !== right.virtualized ||
    left.forkingMessageId !== right.forkingMessageId ||
    left.rewindingMessageId !== right.rewindingMessageId ||
    left.retryingMessageId !== right.retryingMessageId ||
    left.cancellingPendingMessageId !== right.cancellingPendingMessageId ||
    left.onActionCardAction !== right.onActionCardAction ||
    left.onA2UILocalAction !== right.onA2UILocalAction ||
    left.onForkFromMessage !== right.onForkFromMessage ||
    left.onRewindToMessage !== right.onRewindToMessage ||
    left.onRetryMessage !== right.onRetryMessage ||
    left.onCancelPendingSteer !== right.onCancelPendingSteer ||
    left.onInteractionResponse !== right.onInteractionResponse ||
    left.activeMcpAppId !== right.activeMcpAppId ||
    left.mcpAppRepository !== right.mcpAppRepository ||
    left.mcpAppResponse !== right.mcpAppResponse ||
    !routedInteractionsEqual(left, right, messageEntityRefs(left.message).tools) ||
    left.onOpenArtifact !== right.onOpenArtifact ||
    left.onOpenFile !== right.onOpenFile ||
    left.onOpenReference !== right.onOpenReference ||
    left.onOpenResource !== right.onOpenResource ||
    left.onOpenSubagent !== right.onOpenSubagent ||
    left.pendingMessageIds?.has(left.message.id) !==
      right.pendingMessageIds?.has(right.message.id) ||
    left.cancellablePendingMessageIds?.has(left.message.id) !==
      right.cancellablePendingMessageIds?.has(right.message.id)
  ) {
    return false;
  }
  const refs = messageEntityRefs(left.message);
  return (
    referencedRowsEqual(left.artifacts, right.artifacts, refs.artifacts) &&
    referencedRowsEqual(left.subagents, right.subagents, refs.subagents) &&
    referencedRowsEqual(left.surfaces, right.surfaces, refs.surfaces) &&
    referencedRowsEqual(left.tasks, right.tasks, refs.tasks) &&
    referencedRowsEqual(left.tools, right.tools, refs.tools) &&
    referencedRowsEqual(left.resources ?? {}, right.resources ?? {}, refs.resources) &&
    linkedSubagentsEqual(left, right, refs.tools)
  );
}

function routedInteractionsEqual(
  left: ConversationMessageRowProps,
  right: ConversationMessageRowProps,
  toolIds: ReadonlySet<string>,
): boolean {
  if (toolIds.size === 0) return true;
  const relevant = (rows: readonly PendingInteraction[] | undefined) =>
    (rows ?? []).filter((row) => row.source.invocation_id && toolIds.has(row.source.invocation_id));
  const leftRows = relevant(left.interactions);
  const rightRows = relevant(right.interactions);
  return (
    leftRows.length === rightRows.length && leftRows.every((row, index) => row === rightRows[index])
  );
}

export function ClioConversation({
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
        (message) => !isProjectedQuestionResumeEnvelope(message, entities.interactions),
      ),
    [entities.interactions, sourceMessages],
  );
  const { mode: defaultDisplayMode } = useConversationDisplay();
  const { conversationWidth } = useAppearancePreferences();
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollComplete = useRef(false);
  const pinnedToBottom = useRef(true);
  const lastUserScrollIntentAt = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [activeMessageIndex, setActiveMessageIndex] = useState(0);
  const [conversationViewportWidth, setConversationViewportWidth] = useState(0);
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
  const minimapVisible = conversationViewportWidth >= 760;
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
        return indexes;
      },
      [activeStreamingIndex],
    ),
  });
  const virtualRows = virtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows.at(-1);
  const virtualRangeKey = `${firstVirtualRow?.index ?? -1}:${firstVirtualRow?.start ?? -1}:${lastVirtualRow?.index ?? -1}:${lastVirtualRow?.end ?? -1}`;

  // The virtualizer is the only source of the active transcript index, on both
  // branches. It measures every mounted row, so an index it reports may well be
  // one the minimap rail has not mounted — reading the rail's own DOM back could
  // only ever name a landmark that is already on screen.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (pinnedToBottom.current) {
      const latestIndex = messages.length - 1;
      setActiveMessageIndex((current) => (current === latestIndex ? current : latestIndex));
      return;
    }
    const firstVisible = virtualizer
      .getVirtualItems()
      .find((item) => item.end >= element.scrollTop);
    if (!firstVisible) return;
    setActiveMessageIndex((current) =>
      current === firstVisible.index ? current : firstVisible.index,
    );
  }, [messages.length, virtualizer, virtualRangeKey]);

  const updateBottomState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const next = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    if (next || performance.now() - lastUserScrollIntentAt.current < 500) {
      pinnedToBottom.current = next;
    }
    setIsAtBottom(next);
    if (next) {
      setActiveMessageIndex(messages.length - 1);
      return;
    }
    const firstVisible = virtualizer
      .getVirtualItems()
      .find((item) => item.end >= element.scrollTop);
    if (firstVisible) setActiveMessageIndex(firstVisible.index);
  }, [messages.length, virtualizer]);

  const markUserScrollIntent = useCallback(() => {
    lastUserScrollIntentAt.current = performance.now();
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ behavior, top: element.scrollHeight });
    pinnedToBottom.current = true;
    setIsAtBottom(true);
  }, []);
  const jumpToMessage = useCallback(
    (index: number) => {
      const message = messages[index];
      if (!message) return;
      markUserScrollIntent();
      pinnedToBottom.current = index === messages.length - 1;
      setActiveMessageIndex(index);
      if (virtualized) virtualizer.scrollToIndex(index, { align: 'auto' });
      else document.getElementById(`message-${message.id}`)?.scrollIntoView({ block: 'nearest' });
      window.requestAnimationFrame(() => {
        document.getElementById(`message-${message.id}`)?.focus({ preventScroll: true });
      });
    },
    [markUserScrollIntent, messages, virtualized, virtualizer],
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let width = Math.round(element.getBoundingClientRect().width);
    setConversationViewportWidth(width);
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry?.contentRect.width ?? 0);
      if (!nextWidth || nextWidth === width) return;
      width = nextWidth;
      setConversationViewportWidth(nextWidth);
      const keepLatestVisible = pinnedToBottom.current;
      // Only mounted rows carry a live ResizeObserver, so every off-screen row
      // still holds the height it had at the previous width. Keeping those
      // stale heights makes the transcript jump when the reader scrolls back
      // up; re-estimating and re-measuring costs a frame and stays honest.
      virtualizer.measure();
      window.cancelAnimationFrame(frame);
      if (keepLatestVisible) {
        frame = window.requestAnimationFrame(() => scrollToLatest('instant'));
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [scrollToLatest, virtualizer]);

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
      const messageId = decodeURIComponent(window.location.hash.slice('#message-'.length));
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      virtualizer.scrollToIndex(index, { align: 'center' });
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          document.getElementById(`message-${messageId}`)?.focus({ preventScroll: true });
        });
      });
    };
    focusSearchResult();
    window.addEventListener('hashchange', focusSearchResult);
    return () => {
      window.removeEventListener('hashchange', focusSearchResult);
      window.cancelAnimationFrame(frame);
    };
  }, [messages, virtualizer]);

  useEffect(() => {
    if (!pinnedToBottom.current || messages.length === 0) return;
    const frame = window.requestAnimationFrame(() => scrollToLatest('instant'));
    return () => window.cancelAnimationFrame(frame);
  }, [messages, scrollToLatest]);

  useLayoutEffect(() => {
    if (!pinnedToBottom.current || messages.length === 0) return;
    const frame = window.requestAnimationFrame(() => scrollToLatest('instant'));
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
          if (
            ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(event.key)
          ) {
            markUserScrollIntent();
          }
        }}
        onScroll={updateBottomState}
        onTouchMove={markUserScrollIntent}
        onWheel={markUserScrollIntent}
        ref={scrollRef}
        role="log"
        style={{ paddingBottom: bottomInset }}
        tabIndex={0}
      >
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

import { brand } from '@brand';
