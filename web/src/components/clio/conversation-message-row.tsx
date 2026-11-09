import type { PendingInteraction, Message as DomainMessage } from '@clio/core/v3';
import { AlertTriangleIcon, BookmarkIcon, Globe2Icon, MapIcon } from 'lucide-react';
import { m } from 'motion/react';
import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatClockTime, formatDateTime } from '@/lib/locale-format';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { turnModelExhausted } from '@/lib/turn-model-exhausted';
import { TurnModelExhausted } from './turn-model-exhausted';
import { TurnProviderSignIn } from './turn-provider-sign-in';
import { useAttentionEvidenceTarget } from '@/hooks/use-attention-evidence-target';
import { completionFooterShown, MessageCompletionFooter } from './message-completion-footer';
import { MessageRowActions } from './message-row-actions';
import { Tag } from './primitives/tag';
import { messageToolCallCounts } from './message-tool-call-counts';
import { ConversationModelCheckpoint } from './conversation-model-boundary';
import { modelBoundariesEqual } from './conversation-model-boundaries';
import { ConversationForkCheckpoint } from './conversation-fork-checkpoint';
import { canGroupUserMessages, feedbackMessage } from './conversation-user-group';
import { ParentDelegationMessage } from './parent-delegation-message';
import { isParentDelegation } from './parent-delegation';
import { ConversationSummonedWork } from './conversation-summoned-work';
import { DiffusionCanvas } from './diffusion-canvas';

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
  const modelExhausted = turnModelExhausted(message.error_info);
  const canRetry =
    message.role === 'assistant' &&
    (message.blocks.length === 0 ||
      message.blocks.some((block) => block.type === 'error' && block.recoverable));
  const pendingSteer = message.role === 'user' && entities.pendingMessageIds?.has(message.id);

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
  // A delegation is recorded inside an assistant turn by the runtime. Keep its
  // input visible before the response while retaining later prompts at their step.
  const leadingDelegations = [];
  for (const segment of turn.segments) {
    if (segment.kind !== 'block' || !isParentDelegation(segment.block)) break;
    leadingDelegations.push(segment.block);
  }
  const leadingDelegationIds = new Set(leadingDelegations.map((block) => block.id));
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
  const marked = entities.markedMessageIds?.has(message.id) ?? false;
  const actions = (
    <MessageRowActions active={active} canRetry={canRetry} entities={entities} message={message} />
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
        responseContinued || userContinued ? 'pb-0' : 'pb-1',
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
      {message.role === 'assistant' && leadingDelegations.length > 0 ? (
        <ParentDelegationMessage message={{ ...message, blocks: leadingDelegations }} />
      ) : null}
      {message.role === 'system' && message.blocks.some(isParentDelegation) ? (
        <>
          <ParentDelegationMessage message={message} />
          <MessageBlockSequence
            blocks={message.blocks.filter((block) => !isParentDelegation(block))}
            messageId={message.id}
            messageSessionId={message.session_id}
            {...entities}
          />
        </>
      ) : message.role === 'system' &&
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
          <Message
            className={cn('gap-1', message.role === 'assistant' && 'group/reply')}
            from={message.role === 'unknown' ? 'system' : message.role}
          >
            {message.role !== 'assistant' && message.role !== 'user' && !responseContinuation ? (
              <div
                className="mb-1 flex h-[22px] items-center gap-3 text-[11.5px] font-medium text-muted-foreground"
                data-slot="conversation-message-sender"
              >
                <span>{message.role === 'system' ? 'System' : 'Unknown sender'}</span>
                <time dateTime={message.created_at} title={formatDateTime(message.created_at)}>
                  {formatClockTime(message.created_at)}
                </time>
                <div className="ml-auto">{actions}</div>
              </div>
            ) : null}
            <div
              className={
                message.role === 'user' ? 'group/prompt flex min-w-0 flex-col items-end' : undefined
              }
            >
              <MessageContent
                className={cn(
                  message.role === 'assistant' && 'w-full gap-1',
                  message.role === 'user' && 'max-w-[85%] sm:max-w-[72%]',
                )}
              >
                {message.blocks.length === 0 &&
                message.role === 'assistant' &&
                !message.canvas &&
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
                        {modelExhausted ? (
                          <TurnModelExhausted
                            exhausted={modelExhausted}
                            messageId={message.id}
                            sessionId={message.session_id}
                          />
                        ) : null}
                      </AlertDescription>
                    ) : null}
                  </Alert>
                ) : message.role === 'assistant' &&
                  (turnPresentation ||
                    turn.iterations.length > 0 ||
                    turn.segments.some(
                      (segment) => segment.kind === 'block' && isParentDelegation(segment.block),
                    ) ||
                    Boolean(feedbackMessages?.length)) ? (
                  <>
                    {turn.segments
                      .filter(
                        (segment) =>
                          !(
                            segment.kind === 'block' && leadingDelegationIds.has(segment.block.id)
                          ) &&
                          (segment.kind !== 'block' ||
                            segment.block.type !== 'subagent' ||
                            !linkedSubagentIds.has(segment.block.subagent_id)),
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
                          isParentDelegation(segment.block) ? (
                            <ParentDelegationMessage
                              key={segment.block.id}
                              message={{ ...message, blocks: [segment.block] }}
                            />
                          ) : (
                            <MessageBlockSequence
                              blocks={[segment.block]}
                              messageBlocks={message.blocks}
                              key={segment.block.id}
                              messageId={message.id}
                              messageAttentionIndex={messageAttentionIndex}
                              messageSessionId={message.session_id}
                              {...entities}
                            />
                          )
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
                    <ConversationSummonedWork metadata={message.metadata} />
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
                    <ConversationSummonedWork metadata={message.metadata} />
                  </>
                )}
                {message.role === 'assistant' && message.canvas ? (
                  <DiffusionCanvas canvas={message.canvas} />
                ) : null}
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
                <div
                  className="mt-0.5 flex h-[22px] max-w-full items-center justify-end gap-3 whitespace-nowrap text-[11.5px] text-muted-foreground"
                  data-slot="user-message-actions"
                >
                  {pendingSteer ? (
                    <Tag tone="info" width="auto">
                      Queued
                    </Tag>
                  ) : null}
                  {executionMode ? (
                    <span
                      aria-label={
                        executionMode === 'plan'
                          ? 'Sent in Plan mode'
                          : 'Sent in Deep research mode'
                      }
                      className="inline-flex"
                      role="img"
                    >
                      <Tag width="auto">
                        <span className="inline-flex items-center gap-1">
                          {executionMode === 'plan' ? (
                            <MapIcon aria-hidden="true" className="size-3" />
                          ) : (
                            <Globe2Icon aria-hidden="true" className="size-3" />
                          )}
                          {executionMode === 'plan' ? 'Plan' : 'Deep research'}
                        </span>
                      </Tag>
                    </span>
                  ) : null}
                  {marked ? (
                    <BookmarkIcon
                      aria-label="Marked message"
                      className={cn(
                        'size-3.5 shrink-0',
                        entities.onMarkMessage &&
                          'sm:group-focus-within/prompt:invisible sm:group-hover/prompt:invisible',
                      )}
                      fill="currentColor"
                      role="img"
                    />
                  ) : null}
                  <div
                    className={cn(
                      'flex items-center gap-3',
                      !pendingSteer &&
                        'sm:pointer-events-none sm:opacity-0 sm:group-focus-within/prompt:pointer-events-auto sm:group-focus-within/prompt:opacity-100 sm:group-hover/prompt:pointer-events-auto sm:group-hover/prompt:opacity-100',
                    )}
                  >
                    <time dateTime={message.created_at} title={formatDateTime(message.created_at)}>
                      {formatClockTime(message.created_at)}
                    </time>
                    {actions}
                  </div>
                </div>
              ) : null}
            </div>
            {message.role === 'assistant' ? (
              <MessageCompletionFooter
                active={active || awaitingChild || responseContinued}
                agentName={entities.agentName}
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
              <div className="flex h-6 items-center">{actions}</div>
            ) : message.role === 'assistant' &&
              marked &&
              !completionFooterShown(message, active || awaitingChild || responseContinued) ? (
              <div className="mb-1.5 flex h-6 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <BookmarkIcon
                  aria-label="Marked message"
                  className="size-3.5"
                  fill="currentColor"
                  role="img"
                />
                Marked
              </div>
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
    left.agentName !== right.agentName ||
    left.attentionData !== right.attentionData ||
    !routedInteractionsEqual(left, right, messageEntityRefs(left.message).tools) ||
    left.onOpenArtifact !== right.onOpenArtifact ||
    left.onOpenFile !== right.onOpenFile ||
    left.onOpenWork !== right.onOpenWork ||
    left.onOpenTasks !== right.onOpenTasks ||
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
