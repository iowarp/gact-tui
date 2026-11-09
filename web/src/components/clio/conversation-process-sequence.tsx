import type {
  Artifact,
  MessageBlock,
  PendingInteraction,
  PendingInteractionResponse,
  SubagentRun,
  Task,
  ToolInvocation,
} from '@clio/core/v3';
import { TranscriptTaskRow } from './transcript-task-row';
import { ClioStreamingText } from './streaming-text';
import { ClioAgentMessageLine, ClioSubagentCard, type SubagentOpenTarget } from './subagent-card';
import { ClioToolInvocation } from './tool-invocation';
import { questionInteractionsForTool } from './agent-answer-domain';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import { GroundedMessageResponse } from './grounded-message-response';
import { bucketIntensity } from '@/lib/attention-text';
import { toolStepShare, type MessageAttentionIndex } from '@/lib/attention-tool-index';
import { TranscriptReasoning } from './transcript-reasoning';
import { TranscriptReasoningPassage } from './transcript-reasoning-passage';

export type ProcessBlock = Extract<
  MessageBlock,
  { type: 'text' | 'reasoning' | 'tool' | 'task' | 'subagent' | 'agent_message' }
>;

interface ConversationProcessSequenceProps {
  block: ProcessBlock;
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, Task>;
  subagents: Record<string, SubagentRun>;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  reasoningDefaultOpen?: boolean;
  interactions?: readonly PendingInteraction[];
  artifacts?: Record<string, Artifact>;
  onOpenArtifact?: (artifact: Artifact) => void;
  onInteractionResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  messageId?: string;
  messageSessionId?: string;
  messageAttentionIndex?: MessageAttentionIndex;
}

type ProcessEntities = Omit<ConversationProcessSequenceProps, 'block'>;

/** Keeps causal order while preserving the native semantics of each AI Elements surface. */
export function ConversationProcessSequence({
  block,
  tools,
  tasks,
  subagents,
  onOpenSubagent,
  reasoningDefaultOpen,
  interactions,
  artifacts,
  onOpenArtifact,
  onInteractionResponse,
  messageId,
  messageSessionId,
  messageAttentionIndex,
}: ConversationProcessSequenceProps) {
  return renderSingleProcessBlock(block, {
    onOpenSubagent,
    reasoningDefaultOpen,
    subagents,
    tasks,
    tools,
    interactions,
    artifacts,
    onOpenArtifact,
    onInteractionResponse,
    messageId,
    messageSessionId,
    messageAttentionIndex,
  });
}

function renderSingleProcessBlock(block: ProcessBlock, entities: ProcessEntities) {
  if (block.type === 'text') {
    return block.streaming ? (
      <ClioStreamingText active className="leading-7" text={block.text} />
    ) : (
      <GroundedMessageResponse>{block.text}</GroundedMessageResponse>
    );
  }
  if (block.type === 'reasoning') {
    return (
      <TranscriptReasoningPassage
        text={block.text}
        streaming={block.streaming}
        startedAt={block.started_at}
        durationMs={block.duration_ms}
        source={
          entities.messageId && entities.messageSessionId
            ? {
                messageId: entities.messageId,
                sessionId: entities.messageSessionId,
                partId: block.id,
                field: 'text',
              }
            : undefined
        }
      />
    );
  }
  if (block.type === 'tool') {
    const tool = entities.tools[block.tool_id];
    const questions = questionInteractionsForTool(entities.interactions, block.tool_id);
    const attentionEntries = entities.messageAttentionIndex?.toolStepsByToolId.get(block.tool_id);
    const thoughtAttention = attentionEntries?.find((entry) => entry.kind === 'thought');
    const toolShare = toolStepShare(attentionEntries);
    const maxToolShare = entities.messageAttentionIndex?.maxToolStepShare ?? 0;
    const attentionBadge =
      attentionEntries && toolShare > 0
        ? { share: toolShare, bucket: bucketIntensity(toolShare, maxToolShare) }
        : undefined;
    return (
      <div className="space-y-1">
        {block.thought ? (
          <TranscriptReasoning
            text={block.thought}
            source={
              entities.messageId && entities.messageSessionId
                ? {
                    messageId: entities.messageId,
                    sessionId: entities.messageSessionId,
                    partId: thoughtAttention?.part_id ?? block.id,
                    field: 'thought',
                    callId: block.tool_id,
                  }
                : undefined
            }
          >
            <GroundedMessageResponse>{block.thought}</GroundedMessageResponse>
          </TranscriptReasoning>
        ) : null}
        <ClioToolInvocation
          attention={attentionBadge}
          attentionFields={attentionEntries}
          sessionId={entities.messageSessionId}
          tool={tool}
        />
        {questions.map((interaction) => (
          <ConversationInteractionActivity
            artifacts={entities.artifacts ?? {}}
            interaction={interaction}
            key={interaction.id}
            onOpenArtifact={entities.onOpenArtifact}
            onResponse={entities.onInteractionResponse}
          />
        ))}
      </div>
    );
  }
  if (block.type === 'task') {
    return <TranscriptTaskRow id={block.task_id} task={entities.tasks[block.task_id]} />;
  }
  if (block.type === 'agent_message') {
    return (
      <ClioAgentMessageLine
        block={block}
        onOpen={entities.onOpenSubagent}
        subagent={entities.subagents[block.subagent_id]}
      />
    );
  }
  return (
    <ClioSubagentCard
      onOpen={entities.onOpenSubagent}
      subagent={entities.subagents[block.subagent_id]}
    />
  );
}
