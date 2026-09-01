import type { Message, MessageBlock, ToolInvocation } from '@clio/core/v3';
import { truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';

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
  tools: ToolInvocation[];
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
): ConversationTurnPresentation {
  const { iterations, consumed } = fallbackIterations(message, tools);
  return {
    iterations,
    residualBlocks: message.blocks.filter((block) => !consumed.has(block.id)),
  };
}

function fallbackIterations(
  message: Message,
  tools: Record<string, ToolInvocation>,
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
    current.terminal = terminal;
    current.interrupted = interrupted;
    current.summary = iterationSummary(
      current.nextThoughts,
      current.tools,
      current.terminal,
      current.thinking.at(-1)?.text,
    );
    iterations.push(current);
    current = emptyIteration(message, iterations.length);
  };

  for (const { block } of ordered) {
    if (block.type === 'reasoning') {
      if (current.nextThoughts.length > 0 || current.tools.length > 0) flush();
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
      if (current.tools.length > 0) flush();
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
      if (!current.tools.some((candidate) => candidate.id === tool.id)) {
        current.tools.push(tool);
      }
      if (block.thought && current.nextThoughts.length === 0) {
        current.nextThoughts.push(block.thought);
      }
      current.streaming ||= ['pending', 'running'].includes(tool.state);
      consumed.add(block.id);
      continue;
    }
    if (hasIterationContent(current) && block.type === 'text' && block.channel === 'answer') {
      flush(current.tools.length === 0);
    }
  }
  flush(
    messageCompletedNormally(message) && current.tools.length === 0,
    messageInterrupted(message),
  );
  return { consumed, iterations };
}

function emptyIteration(message: Message, index: number): ConversationIteration {
  return {
    id: `${message.id}:iteration:${index}`,
    index,
    agentId: 'main',
    thinking: [],
    nextThoughts: [],
    tools: [],
    terminal: false,
    interrupted: false,
    streaming: false,
    summary: '',
  };
}

function hasIterationContent(iteration: ConversationIteration): boolean {
  return (
    iteration.thinking.length > 0 || iteration.nextThoughts.length > 0 || iteration.tools.length > 0
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
  terminal: boolean,
  eventSummary?: string,
): string {
  const thought = nextThoughts.find((value) => value.trim());
  if (thought) return compactSentence(thought);
  if (eventSummary) return compactSentence(eventSummary);
  const tool = tools[0];
  if (tool) return `${tool.title ?? tool.name} requested`;
  return terminal ? 'Preparing the final response' : 'Reasoning about the next action';
}

function compactSentence(value: string): string {
  const line = value.replace(/\s+/gu, ' ').trim();
  const sentenceEnd = line.search(/(?<=[.!?])\s/u);
  const sentence = (sentenceEnd >= 0 ? line.slice(0, sentenceEnd + 1) : line).trim();
  return truncate(sentence, SUMMARY_TRUNCATE_CHARS);
}
