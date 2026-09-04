import type {
  MessageBlock,
  PendingInteraction,
  SubagentRun,
  Task,
  ToolInvocation,
} from '@clio/core/v3';
import { ChevronDownIcon, ListChecksIcon } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Task as AITask, TaskContent, TaskItem, TaskTrigger } from '@/components/ai-elements/task';
import { ClioStatus } from './status';
import { ClioStreamingText } from './streaming-text';
import { ClioSubagentCard, type SubagentOpenTarget } from './subagent-card';
import { ClioToolInvocation } from './tool-invocation';
import { questionInteractionsForTool } from './agent-answer-domain';

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
  interactions?: readonly PendingInteraction[];
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
}: ConversationProcessSequenceProps) {
  return renderSingleProcessBlock(block, {
    onOpenSubagent,
    reasoningDefaultOpen,
    subagents,
    tasks,
    tools,
    interactions,
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
    const questions = questionInteractionsForTool(entities.interactions, block.tool_id);
    return (
      <div className="space-y-3">
        {block.thought ? (
          <Reasoning className="mb-0">
            <ReasoningTrigger className="min-h-6" getThinkingMessage={() => 'Thinking'} />
            <ReasoningContent className="mt-3 leading-6">{block.thought}</ReasoningContent>
          </Reasoning>
        ) : null}
        <ClioToolInvocation questionInteractions={questions} tool={tool} />
      </div>
    );
  }
  if (block.type === 'task') {
    const task = entities.tasks[block.task_id];
    const title = task?.title || 'Task unavailable';
    const state = task?.state ?? 'unavailable';
    return (
      // The detail is the only thing a task record adds beyond its title and
      // state, so it has to be reachable — a `title` attribute on a plain span
      // reaches neither the keyboard nor a screen reader. The AI Elements task
      // disclosure owns that reveal; only its trigger is replaced, because the
      // stock one wears a search glyph that reads as a search result here.
      <AITask className="mb-0" defaultOpen={false}>
        <TaskTrigger title={title}>
          <button
            className="flex w-full min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            type="button"
          >
            <ListChecksIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-foreground/85">{title}</span>
            <ClioStatus
              className="h-auto shrink-0 border-0 bg-transparent px-0 py-0 shadow-none"
              value={state}
            />
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            />
          </button>
        </TaskTrigger>
        <TaskContent>
          <TaskItem className="text-xs">{task?.detail || 'No task detail was reported.'}</TaskItem>
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
