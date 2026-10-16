import type { PendingInteraction, Message as DomainMessage } from '@clio/core/v3';
import {
  AlertTriangleIcon,
  BotIcon,
  BookmarkIcon,
  CopyIcon,
  Globe2Icon,
  LoaderCircleIcon,
  MapIcon,
  UserIcon,
} from 'lucide-react';
import { CloseIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { m } from 'motion/react';
import { memo, useCallback } from 'react';
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
import { ClioMessageHistoryActions } from './message-history-actions';
import { MessageBlockSequence } from './conversation-message-blocks';
import { ConversationTurn } from './conversation-turn';
import { VariantRunsForMessage } from './variant-runs-for-message';
import { subagentsForTool } from './subagent-tool-link';
import type { ConversationMessageRowProps } from './conversation-types';
import { specialMessageExecutionMode } from './conversation-message-projection';
import { McpAppResponseMessageRow } from './conversation-message-projections';
import { ClioCompactionProgress } from './conversation-summarization';
import { useConversationTurn } from './use-conversation-turn';
import { useMessageAttentionIndex } from './use-message-attention-index';
import { turnSignInProvider } from '@/lib/turn-sign-in-provider';
import { TurnProviderSignIn } from './turn-provider-sign-in';
import { brand } from '@brand';
import { TranscriptContentPicker } from './transcript-content-picker';
import { useAttentionEvidenceTarget } from '@/hooks/use-attention-evidence-target';
import { MessageCompletionFooter } from './message-completion-footer';
import { ResponseRating } from './response-rating';
import { MessageMarkButton } from './message-mark-button';
import { messageToolCallCounts } from './message-tool-call-counts';
import { ConversationModelCheckpoint } from './conversation-model-boundary';
import { modelBoundariesEqual } from './conversation-model-boundaries';
import { ConversationForkCheckpoint } from './conversation-fork-checkpoint';
import { ClioSubagentProgressLine } from './subagent-card';
import { canGroupUserMessages, feedbackMessage } from './conversation-user-group';

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
  messageCompactions,
  modelBoundary,
  feedbackMessages,
  injectionMessages,
  injectionsGrouped = false,
  active = false,
  liveActivityId,
  responseContinued = false,
  responseContinuation = false,
  userContinuation = false,
  userContinued = false,
  turnPresentation,
  ...entities
}: ConversationMessageRowProps) {
  useAttentionEvidenceTarget(
    message.id,
    useCallback(() => onDisplayModeChange('full'), [onDisplayModeChange]),
  );
  const emptyResponseErrorCode =
    typeof message.error_info?.error === 'string' ? message.error_info.error : undefined;
  const emptyResponseErrorMessage =
    typeof message.error_info?.message === 'string' ? message.error_info.message : undefined;
  const emptyResponseWasClientCancelled =
    emptyResponseErrorCode === 'cancelled' ||
    emptyResponseErrorMessage?.trim().toLowerCase() === 'turn cancelled by client';
  const signInProvider = turnSignInProvider(message.error_info);
  const canRetry =
    message.role === 'assistant' &&
    (message.blocks.length === 0 ||
      message.blocks.some((block) => block.type === 'error' && block.recoverable));
  const retrying = entities.retryingMessageId === message.id;
  const pendingSteer = message.role === 'user' && entities.pendingMessageIds?.has(message.id);
  const cancellablePendingSteer =
    pendingSteer && entities.cancellablePendingMessageIds?.has(message.id);
  const turn = useConversationTurn(
    message,
    entities.tools,
    entities.tasks,
    entities.subagents,
    feedbackMessages,
    injectionMessages,
    turnPresentation,
  );
  const { linkedSubagentIds, residualBlocks } = turn;
  const childIds = [
    ...linkedSubagentIds,
    ...message.blocks.flatMap((block) => (block.type === 'subagent' ? [block.subagent_id] : [])),
  ];
  const pendingChildIds = [...new Set(childIds)].filter((id) => {
    const child = entities.subagents[id];
    return child && !['completed', 'failed', 'cancelled', 'interrupted'].includes(child.state);
  });
  const awaitingChild = pendingChildIds.length > 0;
  const visibleResidualBlocks = residualBlocks.filter(
    (block) => block.type !== 'subagent' || !linkedSubagentIds.has(block.subagent_id),
  );
  // The final answer has begun once any answer text below the activity exists;
  // the activity then folds away, as a finished thinking step does.
  const answerStarted = visibleResidualBlocks.some(
    (block) => block.type === 'text' && block.text.trim().length > 0,
  );
  const executionMode = specialMessageExecutionMode(message);
  const messageAttentionIndex = useMessageAttentionIndex(entities.attentionData, message);

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
    <MessageActions
      className={cn(
        'shrink-0 opacity-100',
        message.role !== 'assistant' &&
          'ml-auto sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100',
      )}
    >
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
            <CloseIcon aria-hidden="true" className="size-3.5" />
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
            <RetryIcon aria-hidden="true" className="size-3.5" />
          )}
        </MessageAction>
      ) : null}
      {message.role === 'assistant' ? (
        <TranscriptContentPicker sessionId={message.session_id} messageId={message.id} />
      ) : null}
      <ResponseRating message={message} active={active} />
      {entities.onMarkMessage ? (
        <MessageMarkButton
          marked={entities.markedMessageIds?.has(message.id) ?? false}
          pending={entities.markingMessageId !== undefined}
          onMark={(marked) => entities.onMarkMessage!(message.id, marked)}
        />
      ) : null}
      {message.role === 'assistant' ? (
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
      ) : null}
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

  if (
    injectionsGrouped ||
    (responseContinuation && turnPresentation?.segments.length === 0 && !message.error_info)
  ) {
    return (
      <div
        data-index={index}
        data-message-id={message.id}
        data-response-continuation={responseContinuation || undefined}
        data-session-id={message.session_id}
        id={`message-${message.id}`}
        ref={measureElement}
        className={virtualized ? 'absolute left-0 top-0 h-0 w-full' : 'h-0'}
        style={virtualized ? { transform: `translateY(${start ?? 0}px)` } : undefined}
      />
    );
  }

  return (
    <div
      className={cn(
        virtualized ? 'absolute left-0 top-0' : 'relative',
        'w-full px-5 outline-none target:rounded-xl target:ring-2 target:ring-primary/50 lg:px-8',
        responseContinued ? 'pb-0' : userContinued ? 'pb-1' : 'pb-3',
        responseContinuation || userContinuation ? 'pt-0' : 'pt-1',
      )}
      data-index={index}
      data-message-id={message.id}
      data-response-continuation={responseContinuation || undefined}
      data-user-continuation={userContinuation || undefined}
      data-selection-surface={message.role === 'assistant' ? 'agent-answer' : undefined}
      data-session-id={message.session_id}
      id={`message-${message.id}`}
      ref={measureElement}
      style={virtualized ? { transform: `translateY(${start ?? 0}px)` } : undefined}
      tabIndex={-1}
    >
      {entities.forkOrigin?.message_count === 0 && index === 0 ? (
        <ConversationForkCheckpoint
          origin={entities.forkOrigin}
          workspaceId={entities.workspaceId}
        />
      ) : null}
      {modelBoundary ? <ConversationModelCheckpoint boundary={modelBoundary} /> : null}
      {message.role === 'system' &&
      message.blocks.length > 0 &&
      message.blocks.every((block) => block.type === 'injection') ? (
        <div className="py-1">
          <ConversationTurn
            iterations={turn.iterations}
            mode={displayMode}
            subagents={entities.subagents}
            messageSessionId={message.session_id}
          />
        </div>
      ) : (
        <m.div
          animate={{ opacity: 1 }}
          initial={{ opacity: recent ? 0 : 1 }}
          transition={{ duration: 0.16 }}
        >
          <Message from={message.role === 'unknown' ? 'system' : message.role}>
            {!responseContinuation && !userContinuation ? (
              <div
                className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"
                data-slot="conversation-message-sender"
              >
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
                {entities.markedMessageIds?.has(message.id) ? (
                  <BookmarkIcon
                    aria-label="Marked message"
                    className="size-3 text-muted-foreground"
                    fill="currentColor"
                  />
                ) : null}
                {message.role !== 'assistant' ? (
                  <time className="font-mono text-[0.625rem]" dateTime={message.created_at}>
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                ) : null}
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
                {message.role !== 'assistant' && message.role !== 'user' ? actions : null}
              </div>
            ) : null}
            <div
              className={
                message.role === 'user' ? 'flex min-w-0 items-start justify-end gap-2' : undefined
              }
            >
              <MessageContent
                className={cn(
                  message.role === 'assistant' && 'w-full',
                  pendingSteer &&
                    'rounded-xl border border-dashed border-primary/60 bg-primary/[0.025] transition-[border-color,background-color] duration-150',
                )}
              >
                {message.blocks.length === 0 &&
                message.role === 'assistant' &&
                !injectionMessages?.length ? (
                  <Alert
                    className={cn(emptyResponseWasClientCancelled && 'w-fit')}
                    variant="destructive"
                  >
                    <AlertTriangleIcon aria-hidden="true" />
                    <AlertTitle
                      className={cn(emptyResponseWasClientCancelled && 'whitespace-nowrap')}
                    >
                      {emptyResponseWasClientCancelled
                        ? 'Response cancelled'
                        : emptyResponseErrorCode === 'server_restart_interrupted'
                          ? 'Response interrupted'
                          : 'Response unavailable'}
                    </AlertTitle>
                    {!emptyResponseWasClientCancelled ? (
                      <AlertDescription>
                        {emptyResponseErrorMessage ??
                          'No response content was recorded for this turn. You can retry the response.'}
                        {signInProvider ? (
                          <TurnProviderSignIn
                            providerId={signInProvider.id}
                            providerLabel={signInProvider.label}
                          />
                        ) : null}
                      </AlertDescription>
                    ) : null}
                  </Alert>
                ) : message.role === 'assistant' &&
                  (turnPresentation ||
                    turn.iterations.length > 0 ||
                    Boolean(feedbackMessages?.length)) ? (
                  <>
                    {turn.segments
                      .filter(
                        (segment) =>
                          segment.kind !== 'block' ||
                          segment.block.type !== 'subagent' ||
                          !linkedSubagentIds.has(segment.block.subagent_id),
                      )
                      .map((segment, segmentIndex, segments) =>
                        segment.kind === 'feedback' ? (
                          <ConversationMessageRow
                            {...entities}
                            key={segment.message.id}
                            message={segment.message}
                            userContinuation={canGroupUserMessages(
                              feedbackMessage(segments[segmentIndex - 1]),
                              segment.message,
                            )}
                            userContinued={canGroupUserMessages(
                              segment.message,
                              feedbackMessage(segments[segmentIndex + 1]),
                            )}
                            index={-1}
                            recent={false}
                            displayMode={displayMode}
                            onDisplayModeChange={onDisplayModeChange}
                          />
                        ) : segment.kind === 'block' ? (
                          <MessageBlockSequence
                            blocks={[segment.block]}
                            key={segment.block.id}
                            messageId={message.id}
                            messageAttentionIndex={messageAttentionIndex}
                            messageSessionId={message.session_id}
                            {...entities}
                          />
                        ) : (
                          <div key={segment.iterations[0]?.id}>
                            <ConversationTurn
                              followLiveActivity={segment.iterations.some(
                                (iteration) => iteration.id === liveActivityId,
                              )}
                              activeMcpAppId={entities.activeMcpAppId}
                              answerStarted={answerStarted}
                              artifacts={entities.artifacts}
                              interactions={entities.interactions}
                              iterations={segment.iterations}
                              mcpAppRepository={entities.mcpAppRepository}
                              messageAttentionIndex={messageAttentionIndex}
                              messageSessionId={message.session_id}
                              mode={displayMode}
                              onOpenSubagent={entities.onOpenSubagent}
                              onOpenArtifact={entities.onOpenArtifact}
                              onInteractionResponse={entities.onInteractionResponse}
                              subagents={entities.subagents}
                            />
                          </div>
                        ),
                      )}
                    <VariantRunsForMessage message={message} />
                  </>
                ) : (
                  <>
                    <VariantRunsForMessage message={message} />
                    <MessageBlockSequence
                      blocks={message.blocks}
                      messageId={message.id}
                      messageAttentionIndex={messageAttentionIndex}
                      messageSessionId={message.session_id}
                      resourcesFirst={message.role === 'user'}
                      compactReferences={message.role === 'user'}
                      {...entities}
                    />
                  </>
                )}
                {messageCompactions?.map((compaction) => (
                  <ClioCompactionProgress compaction={compaction} key={compaction.compaction_id} />
                ))}
                {message.role === 'assistant' &&
                message.blocks.length > 0 &&
                emptyResponseErrorMessage &&
                !emptyResponseWasClientCancelled &&
                !message.blocks.some((block) => block.type === 'error') ? (
                  <Alert variant="destructive" className="mt-3">
                    <AlertTriangleIcon aria-hidden="true" />
                    <AlertTitle>Work interrupted</AlertTitle>
                    <AlertDescription>{emptyResponseErrorMessage}</AlertDescription>
                  </Alert>
                ) : null}
              </MessageContent>
              {message.role === 'user' ? (
                <div className="shrink-0" title={new Date(message.created_at).toLocaleString()}>
                  {userContinuation ? (
                    <time className="sr-only" dateTime={message.created_at}>
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  ) : null}
                  {userContinuation && entities.markedMessageIds?.has(message.id) ? (
                    <BookmarkIcon
                      aria-label="Marked message"
                      className="size-3 text-muted-foreground"
                      fill="currentColor"
                    />
                  ) : null}
                  {actions}
                </div>
              ) : null}
            </div>
            {message.role === 'assistant' &&
            message.blocks.some((block) => block.type === 'text' && block.text.trim())
              ? pendingChildIds.map((id) => (
                  <ClioSubagentProgressLine
                    key={id}
                    subagent={entities.subagents[id]}
                    onOpen={entities.onOpenSubagent}
                  />
                ))
              : null}
            {message.role === 'assistant' ? (
              <MessageCompletionFooter
                active={active || awaitingChild || responseContinued}
                message={message}
                {...messageToolCallCounts(message, entities.tools)}
              >
                {actions}
              </MessageCompletionFooter>
            ) : null}
            {message.role === 'assistant' &&
            canRetry &&
            !active &&
            !message.completed_at &&
            !message.stop_reason ? (
              <div className="mt-3">{actions}</div>
            ) : null}
          </Message>
        </m.div>
      )}
      {entities.forkOrigin?.message_id === message.id ? (
        <ConversationForkCheckpoint
          origin={entities.forkOrigin}
          workspaceId={entities.workspaceId}
        />
      ) : null}
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
    left.active !== right.active ||
    left.liveActivityId !== right.liveActivityId ||
    left.responseContinued !== right.responseContinued ||
    left.responseContinuation !== right.responseContinuation ||
    left.userContinuation !== right.userContinuation ||
    left.userContinued !== right.userContinued ||
    left.turnPresentation !== right.turnPresentation ||
    (Boolean(left.turnPresentation) &&
      (left.subagents !== right.subagents || left.interactions !== right.interactions)) ||
    left.feedbackMessages !== right.feedbackMessages ||
    left.injectionMessages !== right.injectionMessages ||
    left.injectionsGrouped !== right.injectionsGrouped ||
    left.displayMode !== right.displayMode ||
    left.index !== right.index ||
    left.start !== right.start ||
    left.recent !== right.recent ||
    left.measureElement !== right.measureElement ||
    left.virtualized !== right.virtualized ||
    left.forkingMessageId !== right.forkingMessageId ||
    left.markingMessageId !== right.markingMessageId ||
    (left.markedMessageIds?.has(left.message.id) ?? false) !==
      (right.markedMessageIds?.has(right.message.id) ?? false) ||
    left.onMarkMessage !== right.onMarkMessage ||
    left.rewindingMessageId !== right.rewindingMessageId ||
    left.retryingMessageId !== right.retryingMessageId ||
    left.cancellingPendingMessageId !== right.cancellingPendingMessageId ||
    left.onActionCardAction !== right.onActionCardAction ||
    left.onForkFromMessage !== right.onForkFromMessage ||
    left.onRewindToMessage !== right.onRewindToMessage ||
    left.onRetryMessage !== right.onRetryMessage ||
    left.onCancelPendingSteer !== right.onCancelPendingSteer ||
    left.onInteractionResponse !== right.onInteractionResponse ||
    left.activeMcpAppId !== right.activeMcpAppId ||
    left.mcpAppRepository !== right.mcpAppRepository ||
    left.mcpAppResponse !== right.mcpAppResponse ||
    left.messageCompactions !== right.messageCompactions ||
    !modelBoundariesEqual(left.modelBoundary, right.modelBoundary) ||
    left.forkOrigin !== right.forkOrigin ||
    left.attentionData !== right.attentionData ||
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
