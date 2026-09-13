import type { PendingInteraction, Message as DomainMessage } from '@clio/core/v3';
import {
  AlertTriangleIcon,
  BotIcon,
  BrainCircuitIcon,
  CopyIcon,
  EyeIcon,
  Globe2Icon,
  LoaderCircleIcon,
  MapIcon,
  RotateCcwIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import { m } from 'motion/react';
import { memo } from 'react';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from '@/components/ai-elements/message';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ClioMessageHistoryActions } from './message-history-actions';
import { MessageBlockSequence } from './conversation-message-blocks';
import { ConversationTurn } from './conversation-turn';
import { subagentsForTool } from './subagent-tool-link';
import type { ConversationMessageRowProps } from './conversation-types';
import { specialMessageExecutionMode } from './conversation-message-projection';
import { McpAppResponseMessageRow } from './conversation-message-projections';
import { useConversationTurn } from './use-conversation-turn';
import { brand } from '@brand';

export const ConversationMessageRow = memo(function ConversationMessageRow({
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
  const emptyResponseErrorCode =
    typeof message.error_info?.error === 'string' ? message.error_info.error : undefined;
  const emptyResponseErrorMessage =
    typeof message.error_info?.message === 'string' ? message.error_info.message : undefined;
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
  const visibleResidualBlocks = residualBlocks.filter(
    (block) => block.type !== 'subagent' || !linkedSubagentIds.has(block.subagent_id),
  );
  const executionMode = specialMessageExecutionMode(message);

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
            {executionMode === 'plan' ? (
              <Badge aria-label="Sent in Plan mode" variant="outline">
                <MapIcon aria-hidden="true" data-icon="inline-start" />
                Plan
              </Badge>
            ) : executionMode === 'deep_research' ? (
              <Badge aria-label="Sent in Deep research mode" variant="outline">
                <Globe2Icon aria-hidden="true" data-icon="inline-start" />
                Deep research
              </Badge>
            ) : null}
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
                <AlertTitle>
                  {emptyResponseErrorCode === 'server_restart_interrupted'
                    ? 'Response interrupted'
                    : 'Response unavailable'}
                </AlertTitle>
                <AlertDescription>
                  {emptyResponseErrorMessage ??
                    'No response content was recorded for this turn. You can retry the response.'}
                </AlertDescription>
              </Alert>
            ) : message.role === 'assistant' && turn.iterations.length > 0 ? (
              <>
                <div>
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
                </div>
                <MessageBlockSequence
                  blocks={visibleResidualBlocks}
                  messageSessionId={message.session_id}
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
    else if (block.type === 'subagent' || block.type === 'agent_message')
      refs.subagents.add(block.subagent_id);
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
    left.onOpenWork !== right.onOpenWork ||
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
