import type { MessageBlock, SubagentRun, Task, ToolInvocation } from '@clio/core/v3';
import { ListChecksIcon } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Task as AITask, TaskContent, TaskItem, TaskTrigger } from '@/components/ai-elements/task';
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
        <ReasoningContent className="mt-3 leading-6">
          {block.text}
        </ReasoningContent>
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
            <ReasoningContent className="mt-3 leading-6">
              {block.thought}
            </ReasoningContent>
          </Reasoning>
        ) : null}
        <ClioToolInvocation tool={tool} />
      </div>
    );
  }
  if (block.type === 'task') {
    const task = entities.tasks[block.task_id];
    return (
      <AITask className="mb-0 rounded-lg border bg-card/60" defaultOpen={false}>
        <TaskTrigger title={task?.title ?? 'Task unavailable'} />
        <TaskContent>
          <TaskItem className="flex flex-wrap items-start gap-2">
            <ListChecksIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <ClioStatus value={task?.state ?? 'unavailable'} />
            <span className="min-w-0 flex-1">{task?.detail || 'No task detail was reported.'}</span>
          </TaskItem>
        </TaskContent>
      </AITask>
    );
  }
  return (
    <ClioSubagentCard
      onOpen={entities.onOpenSubagent}
      subagent={entities.subagents[block.subagent_id]}
    />
  );
}
