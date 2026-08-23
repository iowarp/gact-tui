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
  BotIcon,
  CopyIcon,
  ExternalLinkIcon,
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
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
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
import { ClioMessageHistoryActions } from './message-history-actions';
import { ClioArtifactCard } from './artifact-card';
import { ConversationProcessSequence, type ProcessBlock } from './conversation-process-sequence';
import { ClioStatus } from './status';
import { ClioStreamingText } from './streaming-text';
import type { SubagentOpenTarget } from './subagent-card';

const ClioA2UISurface = lazy(() =>
  import('./a2ui-surface').then((module) => ({ default: module.ClioA2UISurface })),
);

function A2UISurfaceFallback() {
  return <ClioStatus label="Loading interactive surface" value="running" />;
}

function DeferredA2UISurface({
  onLocalAction,
  surface,
}: {
  onLocalAction?: (action: A2uiClientAction) => string | void | Promise<string | void>;
  surface: A2UISurface;
}) {
  return (
    <Suspense fallback={<A2UISurfaceFallback />}>
      <ClioA2UISurface onLocalAction={onLocalAction} surface={surface} />
    </Suspense>
  );
}

export interface ClioConversationProps {
  messages: readonly DomainMessage[];
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

type GroupedBlock =
  | { kind: 'block'; block: MessageBlock }
  | { kind: 'process'; id: string; blocks: ProcessBlock[] };

function isActivityBlock(block: MessageBlock): block is ProcessBlock {
  return block.type === 'text' || isProcessBlock(block);
}

function isProcessBlock(block: MessageBlock) {
  return ['reasoning', 'tool', 'task', 'subagent'].includes(block.type);
}

function groupCausalBlocks(blocks: readonly MessageBlock[]): GroupedBlock[] {
  const grouped: GroupedBlock[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (!isProcessBlock(block)) {
      grouped.push({ kind: 'block', block });
      continue;
    }

    const activity: ProcessBlock[] = [block as ProcessBlock];
    let cursor = index + 1;
    while (cursor < blocks.length) {
      const candidate = blocks[cursor]!;
      if (!isActivityBlock(candidate)) break;
      if (
        candidate.type === 'text' &&
        !blocks.slice(cursor + 1).some((remaining) => isProcessBlock(remaining))
      ) {
        break;
      }
      activity.push(candidate);
      cursor += 1;
    }
    grouped.push({ kind: 'process', id: block.id, blocks: activity });
    index = cursor - 1;
  }
  return grouped;
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
}: Omit<ClioConversationProps, 'messages'> & { block: MessageBlock }) {
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
          subagents={subagents}
          tasks={tasks}
          tools={tools}
        />
      );
    case 'plan':
      return (
        <Plan defaultOpen>
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
  message: DomainMessage;
  index: number;
  start: number;
  recent: boolean;
  measureElement: (element: Element | null) => void;
}

const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  index,
  start,
  recent,
  measureElement,
  ...entities
}: ConversationMessageRowProps) {
  const canRetry =
    message.role === 'assistant' &&
    (message.blocks.length === 0 ||
      message.blocks.some((block) => block.type === 'error' && block.recoverable));
  const retrying = entities.retryingMessageId === message.id;

  return (
    <div
      className="absolute left-0 top-0 w-full px-5 pb-7 pt-1 outline-none target:rounded-xl target:ring-2 target:ring-primary/50 lg:px-8"
      data-index={index}
      id={`message-${message.id}`}
      ref={measureElement}
      style={{ transform: `translateY(${start}px)` }}
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
            ) : (
              groupCausalBlocks(message.blocks).map((item) =>
                item.kind === 'process' ? (
                  <ConversationProcessSequence
                    blocks={item.blocks}
                    key={item.id}
                    onOpenSubagent={entities.onOpenSubagent}
                    subagents={entities.subagents}
                    tasks={entities.tasks}
                    tools={entities.tools}
                  />
                ) : (
                  <MessageBlockView block={item.block} key={item.block.id} {...entities} />
                ),
              )
            )}
          </MessageContent>
          <MessageActions className="opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
                entities.onForkFromMessage
                  ? () => entities.onForkFromMessage?.(message.id)
                  : undefined
              }
              onRewind={
                entities.onRewindToMessage
                  ? () => entities.onRewindToMessage?.(message.id)
                  : undefined
              }
              rewinding={entities.rewindingMessageId === message.id}
            />
            <MessageAction
              label="Copy message"
              onClick={() =>
                void navigator.clipboard.writeText(
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
        </Message>
      </m.div>
    </div>
  );
});

export function ClioConversation({ messages, ...entities }: ClioConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollComplete = useRef(false);
  const pinnedToBottom = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
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
    pinnedToBottom.current = next;
    setIsAtBottom(next);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ behavior, top: element.scrollHeight });
    pinnedToBottom.current = true;
    setIsAtBottom(true);
  }, []);

  useLayoutEffect(() => {
    if (initialScrollComplete.current || messages.length === 0) return;
    initialScrollComplete.current = true;
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, virtualizer]);

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
        onScroll={updateBottomState}
        ref={scrollRef}
        role="log"
      >
        {messages.length === 0 ? (
          <ConversationEmptyState
            className="h-full"
            description="Send a message to begin. Live reasoning, tools, approvals, and artifacts will stay in causal order here."
            icon={<GitBranchIcon className="size-7" />}
            title="This session has no messages"
          />
        ) : (
          <div
            className="relative mx-auto w-full max-w-4xl"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const message = messages[virtualRow.index];
              if (!message) return null;
              return (
                <ConversationMessageRow
                  {...entities}
                  index={virtualRow.index}
                  key={message.id}
                  measureElement={virtualizer.measureElement}
                  message={message}
                  recent={virtualRow.index >= messages.length - 2}
                  start={virtualRow.start}
                />
              );
            })}
          </div>
        )}
        {detachedSurfaces.length > 0 ? (
          <div className="mx-auto grid w-full max-w-4xl gap-4 px-5 pb-8 lg:px-8">
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
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-lg"
          onClick={() => scrollToLatest()}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowDownIcon aria-hidden="true" className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
import { brand } from '@brand';
