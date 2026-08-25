import type {
  ActionCardAction,
  Artifact,
  A2UISurface,
  Message as DomainMessage,
  MessageBlock,
  SubagentRun,
  Task as DomainTask,
  ToolInvocation,
} from '@clio/core/v3';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  BrainCircuitIcon,
  BotIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileCode2Icon,
  GitBranchIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  RouteIcon,
  PanelsTopLeftIcon,
  UserIcon,
} from 'lucide-react';
import { m } from 'motion/react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import { copyText } from '@/lib/clipboard';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  Plan,
  PlanAction,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';
import { useConversationDisplay } from '@/providers/conversation-display-provider';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { ClioA2UISurface } from './a2ui-surface';
import { ClioMessageHistoryActions } from './message-history-actions';
import { ClioArtifactCard } from './artifact-card';
import { ConversationProcessSequence } from './conversation-process-sequence';
import { ConversationTurn } from './conversation-turn';
import { conversationTurnPresentation, deduplicateArtifactBlocks } from './conversation-turn-model';
import { subagentsForTool } from './subagent-tool-link';
import { ClioStatus } from './status';
import { ClioStreamingText } from './streaming-text';
import type { SubagentOpenTarget } from './subagent-card';

const VIRTUALIZATION_THRESHOLD = 80;

function DeferredA2UISurface({
  onLocalAction,
  surface,
}: {
  onLocalAction?: (action: A2uiClientAction) => string | void | Promise<string | void>;
  surface: A2UISurface;
}) {
  return <ClioA2UISurface onLocalAction={onLocalAction} surface={surface} />;
}

export interface ClioConversationProps {
  messages: readonly DomainMessage[];
  loading?: boolean;
  error?: string;
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, DomainTask>;
  subagents: Record<string, SubagentRun>;
  artifacts: Record<string, Artifact>;
  surfaces: Record<string, A2UISurface>;
  onActionCardAction?: (action: ActionCardAction) => void | Promise<unknown>;
  onA2UILocalAction?: (action: A2uiClientAction) => string | void | Promise<string | void>;
  onForkFromMessage?: (messageId: string) => void | Promise<unknown>;
  forkingMessageId?: string;
  onRewindToMessage?: (messageId: string) => void | Promise<unknown>;
  rewindingMessageId?: string;
  onRetryMessage?: (messageId: string) => void | Promise<unknown>;
  retryingMessageId?: string;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenFile?: (path: string) => void;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

function MessageBlockView({
  block,
  tools,
  tasks,
  subagents,
  artifacts,
  surfaces,
  onActionCardAction,
  onA2UILocalAction,
  onOpenArtifact,
  onOpenFile,
  onOpenSubagent,
  reasoningDefaultOpen,
}: Omit<ClioConversationProps, 'messages'> & {
  block: MessageBlock;
  reasoningDefaultOpen?: boolean;
}) {
  switch (block.type) {
    case 'text':
      return block.streaming ? (
        <ClioStreamingText className="leading-7" active text={block.text} />
      ) : (
        <MessageResponse>{block.text}</MessageResponse>
      );
    case 'reasoning':
      return (
        <ConversationProcessSequence
          blocks={[block]}
          onOpenSubagent={onOpenSubagent}
          reasoningDefaultOpen={reasoningDefaultOpen}
          subagents={subagents}
          tasks={tasks}
          tools={tools}
        />
      );
    case 'tool':
      return (
        <ConversationProcessSequence
          blocks={[block]}
          onOpenSubagent={onOpenSubagent}
          reasoningDefaultOpen={reasoningDefaultOpen}
          subagents={subagents}
          tasks={tasks}
          tools={tools}
        />
      );
    case 'plan':
      return (
        <Plan>
          <PlanHeader>
            <div>
              <PlanTitle>{block.title}</PlanTitle>
              {block.detail ? <PlanDescription>{block.detail}</PlanDescription> : null}
            </div>
            <PlanAction>
              <PlanTrigger />
            </PlanAction>
          </PlanHeader>
        </Plan>
      );
    case 'task': {
      return (
        <ConversationProcessSequence
          blocks={[block]}
          onOpenSubagent={onOpenSubagent}
          reasoningDefaultOpen={reasoningDefaultOpen}
          subagents={subagents}
          tasks={tasks}
          tools={tools}
        />
      );
    }
    case 'subagent': {
      return (
        <ConversationProcessSequence
          blocks={[block]}
          onOpenSubagent={onOpenSubagent}
          reasoningDefaultOpen={reasoningDefaultOpen}
          subagents={subagents}
          tasks={tasks}
          tools={tools}
        />
      );
    }
    case 'artifact': {
      const artifact = artifacts[block.artifact_id];
      return artifact ? (
        <ClioArtifactCard artifact={artifact} onOpen={onOpenArtifact} />
      ) : (
        <Alert>
          <PanelsTopLeftIcon aria-hidden="true" />
          <AlertTitle>Artifact unavailable</AlertTitle>
          <AlertDescription>
            The message refers to an artifact the service did not return.
          </AlertDescription>
        </Alert>
      );
    }
    case 'action_card':
      return (
        <Alert variant={block.severity === 'critical' ? 'destructive' : 'default'}>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>{block.title}</AlertTitle>
          <AlertDescription>
            {block.detail}
            {block.source ? (
              <span className="mt-2 block text-xs">Raised by {block.source}</span>
            ) : null}
          </AlertDescription>
          <div className="col-start-2 mt-3 flex flex-wrap gap-2">
            {block.actions.map((action) => (
              <Button
                disabled={!action.enabled || !onActionCardAction}
                key={action.id}
                onClick={() => void onActionCardAction?.(action)}
                size="sm"
                title={!action.enabled ? action.behavior.reason : undefined}
                variant="outline"
              >
                {action.label}
              </Button>
            ))}
          </div>
        </Alert>
      );
    case 'a2ui': {
      const surface = surfaces[block.surface_id];
      return surface?.state === 'deleted' ? (
        <ClioStatus label="Interactive surface removed" value="cancelled" />
      ) : surface ? (
        <DeferredA2UISurface onLocalAction={onA2UILocalAction} surface={surface} />
      ) : (
        <ClioStatus label="Interactive surface unavailable" value="unavailable" />
      );
    }
    case 'citation':
      return (
        <a
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          href={block.uri}
          rel="noreferrer"
          target="_blank"
        >
          {block.label}
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
        </a>
      );
    case 'diff':
      return (
        <CodeBlock code={block.unified_diff} language="diff" showLineNumbers>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileCode2Icon aria-hidden="true" className="size-3.5" />
              <CodeBlockFilename>{block.path}</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              {onOpenFile ? (
                <Button
                  aria-label={`Open ${block.path} in workspace`}
                  onClick={() => onOpenFile(block.path)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <PanelsTopLeftIcon aria-hidden="true" />
                </Button>
              ) : null}
              <CodeBlockCopyButton aria-label={`Copy diff for ${block.path}`} />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      );
    case 'error':
      return (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>{block.code}</AlertTitle>
          <AlertDescription>
            {block.message}
            {block.recoverable ? ' You can retry this step.' : ''}
          </AlertDescription>
        </Alert>
      );
    case 'routing':
      return (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          <RouteIcon aria-hidden="true" className="size-3.5" />
          <span>{block.label}</span>
          {block.detail ? <span>{block.detail}</span> : null}
        </div>
      );
  }
}

interface ConversationMessageRowProps extends Omit<ClioConversationProps, 'messages'> {
  displayMode: ConversationDisplayMode;
  message: DomainMessage;
  index: number;
  start?: number;
  recent: boolean;
  measureElement?: (element: Element | null) => void;
  virtualized?: boolean;
  onDisplayModeChange: (mode: ConversationDisplayMode) => void;
}

const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  index,
  start,
  recent,
  measureElement,
  virtualized = false,
  displayMode,
  onDisplayModeChange,
  ...entities
}: ConversationMessageRowProps) {
  const canRetry =
    message.role === 'assistant' &&
    (message.blocks.length === 0 ||
      message.blocks.some((block) => block.type === 'error' && block.recoverable));
  const retrying = entities.retryingMessageId === message.id;
  const turn = useMemo(
    () => conversationTurnPresentation(message, entities.tools),
    [entities.tools, message],
  );
  const residualBlocks = useMemo(
    () => deduplicateArtifactBlocks(turn.residualBlocks, entities.artifacts),
    [entities.artifacts, turn.residualBlocks],
  );
  const linkedSubagentIds = useMemo(
    () =>
      new Set(
        turn.iterations.flatMap((iteration) =>
          iteration.tools.flatMap((tool) =>
            subagentsForTool(tool, entities.subagents).map((subagent) => subagent.id),
          ),
        ),
      ),
    [entities.subagents, turn.iterations],
  );
  const actions = (
    <MessageActions className="ml-auto shrink-0 opacity-100 sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
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
      ref={virtualized ? measureElement : undefined}
      style={virtualized ? { transform: `translateY(${start ?? 0}px)` } : undefined}
      tabIndex={-1}
    >
      <m.div
        animate={{ opacity: 1 }}
        initial={{ opacity: recent ? 0 : 1 }}
        transition={{ duration: 0.16 }}
      >
        <Message from={message.role}>
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
                  : 'System'}
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
          <MessageContent>
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
                  iterations={turn.iterations}
                  mode={displayMode}
                  onOpenSubagent={entities.onOpenSubagent}
                  subagents={entities.subagents}
                />
                {residualBlocks
                  .filter(
                    (block) =>
                      block.type !== 'subagent' || !linkedSubagentIds.has(block.subagent_id),
                  )
                  .map((block) => (
                    <MessageBlockView block={block} key={block.id} {...entities} />
                  ))}
              </>
            ) : (
              message.blocks.map((block) => (
                <MessageBlockView block={block} key={block.id} {...entities} />
              ))
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
  };
  for (const block of message.blocks) {
    if (block.type === 'artifact') refs.artifacts.add(block.artifact_id);
    else if (block.type === 'subagent') refs.subagents.add(block.subagent_id);
    else if (block.type === 'a2ui') refs.surfaces.add(block.surface_id);
    else if (block.type === 'task') refs.tasks.add(block.task_id);
    else if (block.type === 'tool') refs.tools.add(block.tool_id);
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

function conversationMessageRowPropsEqual(
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
    left.onActionCardAction !== right.onActionCardAction ||
    left.onA2UILocalAction !== right.onA2UILocalAction ||
    left.onForkFromMessage !== right.onForkFromMessage ||
    left.onRewindToMessage !== right.onRewindToMessage ||
    left.onRetryMessage !== right.onRetryMessage ||
    left.onOpenArtifact !== right.onOpenArtifact ||
    left.onOpenFile !== right.onOpenFile ||
    left.onOpenSubagent !== right.onOpenSubagent
  ) {
    return false;
  }
  // onDisplayModeChange closes only over this immutable message id and the
  // stable state setter, so a freshly-created wrapper is not a row invalidation.
  const refs = messageEntityRefs(left.message);
  return (
    referencedRowsEqual(left.artifacts, right.artifacts, refs.artifacts) &&
    referencedRowsEqual(left.subagents, right.subagents, refs.subagents) &&
    referencedRowsEqual(left.surfaces, right.surfaces, refs.surfaces) &&
    referencedRowsEqual(left.tasks, right.tasks, refs.tasks) &&
    referencedRowsEqual(left.tools, right.tools, refs.tools) &&
    linkedSubagentsEqual(left, right, refs.tools)
  );
}

export function ClioConversation({ messages, loading, error, ...entities }: ClioConversationProps) {
  const { mode: defaultDisplayMode } = useConversationDisplay();
  const { conversationWidth } = useAppearancePreferences();
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollComplete = useRef(false);
  const pinnedToBottom = useRef(true);
  const lastUserScrollIntentAt = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
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
  // TanStack Virtual intentionally returns non-memoizable functions; this component owns them.
  // oxlint-disable-next-line react/incompatible-library
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

  const updateBottomState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const next = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    if (next || performance.now() - lastUserScrollIntentAt.current < 500) {
      pinnedToBottom.current = next;
    }
    setIsAtBottom(next);
  }, []);

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

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let width = Math.round(element.getBoundingClientRect().width);
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry?.contentRect.width ?? 0);
      if (!nextWidth || nextWidth === width) return;
      width = nextWidth;
      const keepLatestVisible = pinnedToBottom.current;
      if (virtualized) virtualizer.measure();
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
  }, [scrollToLatest, virtualized, virtualizer]);

  useLayoutEffect(() => {
    if (initialScrollComplete.current || messages.length === 0) return;
    initialScrollComplete.current = true;
    if (virtualized) virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    else scrollToLatest('instant');
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

  return (
    <div className="relative h-full min-h-0">
      <div
        aria-label="Conversation"
        className="clio-scrollbar h-full overflow-y-auto overscroll-contain"
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
              ? virtualizer.getVirtualItems().map((virtualRow) => ({
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
                  displayMode={turnDisplayModes[message.id] ?? defaultDisplayMode}
                  index={index}
                  key={message.id}
                  measureElement={virtualized ? virtualizer.measureElement : undefined}
                  message={message}
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
          className="absolute right-3 bottom-3 rounded-full shadow-lg"
          onClick={() => scrollToLatest()}
          size="sm"
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
