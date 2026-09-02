import type { Message, MessageBlock, Task, ToolInvocation } from '@clio/core/v3';
import { truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';

/**
 * One correlated unit of work inside an iteration, carrying the kind so the
 * renderer can place it without a second lookup.
 */
export type ConversationActivity =
  | { kind: 'tool'; id: string; tool: ToolInvocation }
  | { kind: 'task'; id: string; task: Task };

export interface ConversationIteration {
  id: string;
  index: number;
  agentId: string;
  thinking: Array<{
    id: string;
    text: string;
    label: string;
    streaming: boolean;
  }>;
  nextThoughts: string[];
  /**
   * Tools and tasks in one lane, in the order the transcript delivered them.
   * A `Task` carries no owning-tool field, so its wire position beside a tool
   * is the only record of what it belongs to; splitting the lane in two would
   * destroy that linkage.
   */
  activity: ConversationActivity[];
  /** Tool projection of {@link activity}, in the same order. */
  tools: ToolInvocation[];
  /** Task projection of {@link activity}, in the same order. */
  tasks: Task[];
  terminal: boolean;
  interrupted: boolean;
  streaming: boolean;
  summary: string;
}

export interface ConversationTurnPresentation {
  iterations: ConversationIteration[];
  residualBlocks: MessageBlock[];
}

/** Build one lossless turn view from the canonical ordered transcript parts. */
export function conversationTurnPresentation(
  message: Message,
  tools: Record<string, ToolInvocation>,
  tasks: Record<string, Task> = {},
): ConversationTurnPresentation {
  const { iterations, consumed } = fallbackIterations(message, tools, tasks);
  return {
    iterations,
    residualBlocks: message.blocks.filter((block) => !consumed.has(block.id)),
  };
}

function fallbackIterations(
  message: Message,
  tools: Record<string, ToolInvocation>,
  tasks: Record<string, Task>,
): { iterations: ConversationIteration[]; consumed: Set<string> } {
  const iterations: ConversationIteration[] = [];
  const consumed = new Set<string>();
  const indexed = message.blocks.map((block, position) => ({ block, position }));
  const ordered = indexed.some(({ block }) => block.sequence === undefined)
    ? indexed
    : indexed.sort((left, right) => (left.block.sequence ?? 0) - (right.block.sequence ?? 0));
  let current = emptyIteration(message, iterations.length);

  const flush = (terminal = false, interrupted = false) => {
    if (!hasIterationContent(current)) return;
    current.tools = current.activity.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : []));
    current.tasks = current.activity.flatMap((entry) => (entry.kind === 'task' ? [entry.task] : []));
    current.terminal = terminal;
    current.interrupted = interrupted;
    current.summary = iterationSummary(
      current.nextThoughts,
      current.tools,
      current.tasks,
      current.terminal,
      current.thinking.at(-1)?.text,
    );
    iterations.push(current);
    current = emptyIteration(message, iterations.length);
  };

  for (const { block } of ordered) {
    if (block.type === 'reasoning') {
      if (current.nextThoughts.length > 0 || current.activity.length > 0) {
        flush();
      }
      current.thinking.push({
        id: block.id,
        label: reasoningLabel(block.provider_source),
        text: block.text,
        streaming: Boolean(block.streaming),
      });
      current.streaming ||= Boolean(block.streaming);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'text' && block.channel === 'next_thought') {
      if (current.activity.length > 0) flush();
      current.nextThoughts.push(block.text);
      current.streaming ||= Boolean(block.streaming);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'tool') {
      const tool = tools[block.tool_id];
      // An unresolved invocation contributes nothing here; the block stays in the
      // residual lane so its typed unavailable state renders at its own position.
      if (!tool) continue;
      if (!alreadyInLane(current, 'tool', tool.id)) {
        current.activity.push({ kind: 'tool', id: tool.id, tool });
      }
      if (block.thought && current.nextThoughts.length === 0) {
        current.nextThoughts.push(block.thought);
      }
      current.streaming ||= ['pending', 'running'].includes(tool.state);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'task') {
      const task = tasks[block.task_id];
      // An unresolved task contributes nothing here; like an unresolved tool the
      // block stays residual so its typed unavailable state renders in place.
      if (!task) continue;
      if (!alreadyInLane(current, 'task', task.id)) {
        current.activity.push({ kind: 'task', id: task.id, task });
      }
      current.streaming ||= ['queued', 'running'].includes(task.state);
      consumed.add(block.id);
      continue;
    }
    if (hasIterationContent(current) && block.type === 'text' && block.channel === 'answer') {
      flush(!current.activity.some((entry) => entry.kind === 'tool'));
    }
  }
  flush(
    messageCompletedNormally(message) && !current.activity.some((entry) => entry.kind === 'tool'),
    messageInterrupted(message),
  );
  return { consumed, iterations };
}

function alreadyInLane(
  iteration: ConversationIteration,
  kind: ConversationActivity['kind'],
  id: string,
): boolean {
  return iteration.activity.some((entry) => entry.kind === kind && entry.id === id);
}

function emptyIteration(message: Message, index: number): ConversationIteration {
  return {
    id: `${message.id}:iteration:${index}`,
    index,
    agentId: 'main',
    thinking: [],
    nextThoughts: [],
    activity: [],
    tools: [],
    tasks: [],
    terminal: false,
    interrupted: false,
    streaming: false,
    summary: '',
  };
}

function hasIterationContent(iteration: ConversationIteration): boolean {
  return (
    iteration.thinking.length > 0 ||
    iteration.nextThoughts.length > 0 ||
    iteration.activity.length > 0
  );
}

function messageCompletedNormally(message: Message): boolean {
  if (!message.completed_at && !message.stop_reason) return false;
  return !messageInterrupted(message);
}

function messageInterrupted(message: Message): boolean {
  return ['cancelled', 'error', 'failed', 'interrupted'].includes(
    message.stop_reason?.toLocaleLowerCase() ?? '',
  );
}

function reasoningLabel(_provider?: string): string {
  return 'Thinking';
}

function iterationSummary(
  nextThoughts: readonly string[],
  tools: readonly ToolInvocation[],
  tasks: readonly Task[],
  terminal: boolean,
  eventSummary?: string,
): string {
  const thought = nextThoughts.find((value) => value.trim());
  if (thought) return compactSentence(thought);
  if (eventSummary) return compactSentence(eventSummary);
  const tool = tools[0];
  if (tool) return `${tool.title ?? tool.name} requested`;
  const task = tasks[0];
  if (task) return compactSentence(task.title);
  return terminal ? 'Preparing the final response' : 'Reasoning about the next action';
}

function compactSentence(value: string): string {
  const line = value.replace(/\s+/gu, ' ').trim();
  const sentenceEnd = line.search(/(?<=[.!?])\s/u);
  const sentence = (sentenceEnd >= 0 ? line.slice(0, sentenceEnd + 1) : line).trim();
  return truncate(sentence, SUMMARY_TRUNCATE_CHARS);
}
