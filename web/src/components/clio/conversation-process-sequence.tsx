import type { MessageBlock, SubagentRun, Task, ToolInvocation } from '@clio/core/v3';
import {
  BotIcon,
  BrainIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
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
  blocks: readonly ProcessBlock[];
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, Task>;
  subagents: Record<string, SubagentRun>;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

/** Keeps causal order while preserving the native semantics of each AI Elements surface. */
export function ConversationProcessSequence({
  blocks,
  tools,
  tasks,
  subagents,
  onOpenSubagent,
}: ConversationProcessSequenceProps) {
  if (blocks.length === 1) {
    return renderSingleProcessBlock(blocks[0]!, {
      onOpenSubagent,
      subagents,
      tasks,
      tools,
    });
  }

  const active = blocks.some((block) => {
    if (block.type === 'reasoning' || block.type === 'text') return block.streaming;
    if (block.type === 'tool') {
      return ['pending', 'running'].includes(tools[block.tool_id]?.state ?? '');
    }
    if (block.type === 'task') {
      return ['queued', 'running'].includes(tasks[block.task_id]?.state ?? '');
    }
    return ['queued', 'running'].includes(subagents[block.subagent_id]?.state ?? '');
  });

  return (
    <ChainOfThought
      className="rounded-xl border border-border/70 bg-muted/10 px-3 py-2.5"
      defaultOpen
    >
      <ChainOfThoughtHeader className="min-h-7">
        {active ? 'Work in progress' : activitySummary(blocks)}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent className="mt-3">
        {blocks.map((block) => (
          <ActivityStep
            block={block}
            key={block.id}
            onOpenSubagent={onOpenSubagent}
            subagents={subagents}
            tasks={tasks}
            tools={tools}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

type ProcessEntities = Omit<ConversationProcessSequenceProps, 'blocks'>;

function ActivityStep({
  block,
  tools,
  tasks,
  subagents,
  onOpenSubagent,
}: ProcessEntities & { block: ProcessBlock }) {
  if (block.type === 'text') {
    return (
      <ChainOfThoughtStep
        icon={MessageSquareTextIcon}
        label={block.streaming ? 'Live update' : 'Progress update'}
        status={block.streaming ? 'active' : 'complete'}
      >
        {block.streaming ? (
          <ClioStreamingText active className="text-sm leading-6" text={block.text} />
        ) : (
          <MessageResponse className="text-sm leading-6">{block.text}</MessageResponse>
        )}
      </ChainOfThoughtStep>
    );
  }
  if (block.type === 'reasoning') {
    return (
      <ChainOfThoughtStep
        icon={BrainIcon}
        label={block.streaming ? 'Reasoning in progress' : 'Reasoning'}
        status={block.streaming ? 'active' : 'complete'}
      >
        <MessageResponse className="text-sm leading-6 text-muted-foreground">
          {reasoningMarkdown(block.text)}
        </MessageResponse>
      </ChainOfThoughtStep>
    );
  }
  if (block.type === 'tool') {
    const tool = tools[block.tool_id];
    const isActive = tool?.state === 'pending' || tool?.state === 'running';
    return (
      <ChainOfThoughtStep
        icon={WrenchIcon}
        label={<ClioToolInvocation defaultOpen={isActive} embedded tool={tool} />}
        status={isActive ? 'active' : 'complete'}
      />
    );
  }
  if (block.type === 'task') {
    const task = tasks[block.task_id];
    const isActive = task?.state === 'running' || task?.state === 'queued';
    return (
      <ChainOfThoughtStep
        icon={ListChecksIcon}
        label={task?.title ?? 'Task unavailable'}
        status={isActive ? 'active' : 'complete'}
      >
        <div className="flex flex-wrap items-start gap-2">
          <ClioStatus value={task?.state ?? 'unavailable'} />
          <span className="min-w-0 flex-1 text-sm text-muted-foreground">
            {task?.detail || 'No task detail was reported.'}
          </span>
        </div>
      </ChainOfThoughtStep>
    );
  }
  const subagent = subagents[block.subagent_id];
  const isActive = subagent?.state === 'queued' || subagent?.state === 'running';
  return (
    <ChainOfThoughtStep
      icon={BotIcon}
      label={subagent?.title ?? 'Child agent unavailable'}
      status={isActive ? 'active' : 'complete'}
    >
      <ClioSubagentCard onOpen={onOpenSubagent} subagent={subagent} />
    </ChainOfThoughtStep>
  );
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
        className="mb-0 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5"
        defaultOpen={block.streaming}
        isStreaming={block.streaming}
      >
        <ReasoningTrigger
          className="min-h-6"
          getThinkingMessage={(streaming) => (streaming ? 'Reasoning in progress' : 'Reasoning')}
        />
        <ReasoningContent className="mt-3 leading-6">
          {reasoningMarkdown(block.text)}
        </ReasoningContent>
      </Reasoning>
    );
  }
  if (block.type === 'tool') {
    const tool = entities.tools[block.tool_id];
    const active = tool?.state === 'pending' || tool?.state === 'running';
    return <ClioToolInvocation defaultOpen={active} tool={tool} />;
  }
  if (block.type === 'task') {
    const task = entities.tasks[block.task_id];
    const active = task?.state === 'running' || task?.state === 'queued';
    return (
      <AITask className="mb-0 rounded-lg border bg-card/60" defaultOpen={active}>
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

function reasoningMarkdown(text: string): string {
  return text.replace(/\*{4}(?=\S)/gu, '**\n\n**');
}

function activitySummary(blocks: readonly ProcessBlock[]): string {
  const reasoning = blocks.filter((block) => block.type === 'reasoning').length;
  const actions = blocks.filter((block) =>
    ['tool', 'task', 'subagent'].includes(block.type),
  ).length;
  if (reasoning && actions) {
    return `${reasoning} reasoning ${reasoning === 1 ? 'step' : 'steps'}, ${actions} ${actions === 1 ? 'action' : 'actions'}`;
  }
  if (actions) return `${actions} ${actions === 1 ? 'action' : 'actions'}`;
  return reasoning === 1 ? 'Reasoning' : `${reasoning} reasoning steps`;
}
