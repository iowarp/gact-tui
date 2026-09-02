import type { MessageBlock, SubagentRun, Task, ToolInvocation } from '@clio/core/v3';
import { ListChecksIcon } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { ClioStatus } from './status';
import { ClioStreamingText } from './streaming-text';
import { ClioSubagentCard, type SubagentOpenTarget } from './subagent-card';
import { ClioToolInvocation } from './tool-invocation';

export type ProcessBlock = Extract<
  MessageBlock,
  { type: 'text' | 'reasoning' | 'tool' | 'task' | 'subagent' }
>;

interface ConversationProcessSequenceProps {
  block: ProcessBlock;
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, Task>;
  subagents: Record<string, SubagentRun>;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  reasoningDefaultOpen?: boolean;
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
}: ConversationProcessSequenceProps) {
  return renderSingleProcessBlock(block, {
    onOpenSubagent,
    reasoningDefaultOpen,
    subagents,
    tasks,
    tools,
  });
}

function renderSingleProcessBlock(block: ProcessBlock, entities: ProcessEntities) {
  if (block.type === 'text') {
    return block.streaming ? (
      <ClioStreamingText active className="leading-7" text={block.text} />
    ) : (
      <MessageResponse>{block.text}</MessageResponse>
    );
  }
  if (block.type === 'reasoning') {
    return (
      <Reasoning
        className="mb-0"
        defaultOpen={entities.reasoningDefaultOpen}
        isStreaming={block.streaming}
      >
        <ReasoningTrigger
          className="min-h-6"
          getThinkingMessage={(streaming) => (streaming ? 'Thinking in progress' : 'Thinking')}
        />
        <ReasoningContent className="mt-3 leading-6">{block.text}</ReasoningContent>
      </Reasoning>
    );
  }
  if (block.type === 'tool') {
    const tool = entities.tools[block.tool_id];
    return (
      <div className="space-y-3">
        {block.thought ? (
          <Reasoning className="mb-0">
            <ReasoningTrigger className="min-h-6" getThinkingMessage={() => 'Thinking'} />
            <ReasoningContent className="mt-3 leading-6">{block.thought}</ReasoningContent>
          </Reasoning>
        ) : null}
        <ClioToolInvocation tool={tool} />
      </div>
    );
  }
  if (block.type === 'task') {
    const task = entities.tasks[block.task_id];
    return (
      <span
        aria-label={`${task?.title ?? 'Task unavailable'}: ${task?.state ?? 'unavailable'}${task?.detail ? `. ${task.detail}` : ''}`}
        className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
        title={task?.detail}
      >
        <ListChecksIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-foreground/85">
          {task?.title ?? 'Task unavailable'}
        </span>
        <ClioStatus
          className="h-auto shrink-0 border-0 bg-transparent px-0 py-0 shadow-none"
          value={task?.state ?? 'unavailable'}
        />
      </span>
    );
  }
  return (
    <ClioSubagentCard
      onOpen={entities.onOpenSubagent}
      subagent={entities.subagents[block.subagent_id]}
    />
  );
}
