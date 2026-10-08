import type { Message, MessageBlock, Task, ToolInvocation } from '@clio/core/v3';
import { truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import type { ThoughtSource } from './transcript-reasoning';

/**
 * One correlated unit of work inside an iteration, carrying the kind so the
 * renderer can place it without a second lookup.
 */
export type ConversationActivity =
  | { kind: 'tool'; id: string; tool: ToolInvocation }
  | { kind: 'task'; id: string; task: Task }
  | {
      kind: 'subagent';
      id: string;
      block: Extract<MessageBlock, { type: 'subagent' }>;
    }
  | {
      kind: 'agent_message';
      id: string;
      block: Extract<MessageBlock, { type: 'agent_message' }>;
    }
  | {
      kind: 'mcp_app';
      id: string;
      block: Extract<MessageBlock, { type: 'mcp_app' }>;
    };

export interface ConversationIteration {
  id: string;
  index: number;
  agentId: string;
  thinking: Array<{
    id: string;
    text: string;
    label: string;
    streaming: boolean;
    source?: ThoughtSource;
  }>;
  nextThoughts: string[];
  nextThoughtSources?: ThoughtSource[];
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

/**
 * The record of a compaction that happened inside the turn -- its summary or
 * its failure notice. It stays at its step: it renders between the iterations
 * before it and the ones after it.
 */
export interface ConversationTurnCompactionRecord {
  /** How many iterations precede the record. */
  afterIteration: number;
  block: Extract<MessageBlock, { type: 'injection' | 'notice' }>;
}

export interface ConversationTurnPresentation {
  iterations: ConversationIteration[];
  compactionRecords: ConversationTurnCompactionRecord[];
  residualBlocks: MessageBlock[];
  /** Every visible boundary in canonical order, including non-process blocks. */
  segments: ConversationTurnSegment[];
}

export type ConversationTurnSegment =
  | { kind: 'iterations'; iterations: ConversationIteration[] }
  | { kind: 'block'; block: MessageBlock };

/** Build one lossless turn view from the canonical ordered transcript parts. */
export function conversationTurnPresentation(
  message: Message,
  tools: Record<string, ToolInvocation>,
  tasks: Record<string, Task> = {},
): ConversationTurnPresentation {
  const { iterations, compactionRecords, consumed, segments } = fallbackIterations(
    message,
    tools,
    tasks,
  );
  return {
    iterations,
    compactionRecords,
    residualBlocks: message.blocks.filter((block) => !consumed.has(block.id)),
    segments,
  };
}

function fallbackIterations(
  message: Message,
  tools: Record<string, ToolInvocation>,
  tasks: Record<string, Task>,
): {
  iterations: ConversationIteration[];
  compactionRecords: ConversationTurnCompactionRecord[];
  consumed: Set<string>;
  segments: ConversationTurnSegment[];
} {
  const iterations: ConversationIteration[] = [];
  const compactionRecords: ConversationTurnCompactionRecord[] = [];
  const consumed = new Set<string>();
  const segments: ConversationTurnSegment[] = [];
  const indexed = message.blocks.map((block, position) => ({ block, position }));
  const ordered = indexed.some(({ block }) => block.sequence === undefined)
    ? indexed
    : indexed.sort((left, right) => (left.block.sequence ?? 0) - (right.block.sequence ?? 0));
  let current = emptyIteration(message, iterations.length);
  let publicThought: string | undefined;

  const flush = (terminal = false, interrupted = false) => {
    if (!hasIterationContent(current)) return;
    current.tools = current.activity.flatMap((entry) =>
      entry.kind === 'tool' ? [entry.tool] : [],
    );
    current.tasks = current.activity.flatMap((entry) =>
      entry.kind === 'task' ? [entry.task] : [],
    );
    current.terminal = terminal;
    current.interrupted = interrupted;
    current.summary = iterationSummary(
      current.nextThoughts,
      current.tools,
      current.tasks,
      current.terminal,
      current.thinking.at(-1)?.text,
      current.activity.find((entry) => entry.kind === 'subagent')?.block,
    );
    iterations.push(current);
    const last = segments.at(-1);
    if (last?.kind === 'iterations') last.iterations.push(current);
    else segments.push({ kind: 'iterations', iterations: [current] });
    current = emptyIteration(message, iterations.length);
  };

  for (const { block } of ordered) {
    // Transport-only instructions have no visible boundary to split.
    if (block.type === 'injection' && (block.source === 'tool_use' || block.variants_id)) continue;
    if (
      (block.type === 'injection' && block.source === 'summarization') ||
      (block.type === 'notice' && block.source === 'compaction_failed')
    ) {
      flush();
      compactionRecords.push({ afterIteration: iterations.length, block });
      consumed.add(block.id);
      segments.push({ kind: 'block', block });
      continue;
    }
    if (block.type === 'reasoning') {
      if (!block.streaming && !block.text.trim()) {
        consumed.add(block.id);
        continue;
      }
      publicThought = undefined;
      if (current.nextThoughts.length > 0 || current.activity.length > 0) {
        flush();
      }
      current.thinking.push({
        id: block.id,
        label: reasoningLabel(block.provider_source),
        text: block.text,
        streaming: Boolean(block.streaming),
        source: {
          messageId: message.id,
          sessionId: message.session_id,
          partId: block.id,
          field: 'text',
        },
      });
      current.streaming ||= Boolean(block.streaming);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'text' && block.channel === 'next_thought') {
      if (current.activity.length > 0) flush();
      current.nextThoughts.push(block.text);
      publicThought = block.text;
      (current.nextThoughtSources ??= []).push({
        messageId: message.id,
        sessionId: message.session_id,
        partId: block.id,
        field: 'text',
      });
      current.streaming ||= Boolean(block.streaming);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'tool') {
      const tool = tools[block.tool_id];
      // An unresolved invocation contributes nothing here; the block stays in the
      // residual lane so its typed unavailable state renders at its own position.
      if (!tool) {
        flush();
        segments.push({ kind: 'block', block });
        continue;
      }
      if (!alreadyInLane(current, 'tool', tool.id)) {
        current.activity.push({ kind: 'tool', id: tool.id, tool });
      }
      if (block.thought && current.nextThoughts.length === 0 && block.thought !== publicThought) {
        // A surface splits display entries, not the response's repeated tool metadata.
        current.nextThoughts.push(block.thought);
        publicThought = block.thought;
        (current.nextThoughtSources ??= []).push({
          messageId: message.id,
          sessionId: message.session_id,
          partId: block.id,
          field: 'thought',
          callId: block.tool_id,
        });
      }
      current.streaming ||= ['pending', 'running'].includes(tool.state);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'task') {
      const task = tasks[block.task_id];
      // An unresolved task contributes nothing here; like an unresolved tool the
      // block stays residual so its typed unavailable state renders in place.
      if (!task) {
        flush();
        segments.push({ kind: 'block', block });
        continue;
      }
      if (!alreadyInLane(current, 'task', task.id)) {
        current.activity.push({ kind: 'task', id: task.id, task });
      }
      current.streaming ||= ['queued', 'running'].includes(task.state);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'subagent' && block.stage) {
      if (!alreadyInLane(current, 'subagent', block.id)) {
        current.activity.push({ kind: 'subagent', id: block.id, block });
      }
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'agent_message') {
      if (messageToolOwnsReceipt(current, block.message)) {
        consumed.add(block.id);
        continue;
      }
      if (!alreadyInLane(current, 'agent_message', block.id)) {
        current.activity.push({ kind: 'agent_message', id: block.id, block });
      }
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'mcp_app') {
      if (!alreadyInLane(current, 'mcp_app', block.id)) {
        current.activity.push({ kind: 'mcp_app', id: block.id, block });
      }
      consumed.add(block.id);
      continue;
    }
    flush(
      block.type === 'text' &&
        block.channel === 'answer' &&
        !current.activity.some((entry) => entry.kind === 'tool'),
    );
    segments.push({ kind: 'block', block });
  }
  flush(
    messageCompletedNormally(message) && !current.activity.some((entry) => entry.kind === 'tool'),
    messageInterrupted(message),
  );
  return { compactionRecords, consumed, iterations, segments };
}

function messageToolOwnsReceipt(iteration: ConversationIteration, message: string): boolean {
  return iteration.activity.some(
    (entry) =>
      entry.kind === 'tool' &&
      entry.tool.name === 'message_agent' &&
      asRecord(entry.tool.input)?.message === message &&
      entry.tool.presentation?.blocks.some((block) => block.result_kind === 'message'),
  );
}

/** `tool.input` is `unknown` on the wire; narrow it before reading a field. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
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
  subagent?: Extract<MessageBlock, { type: 'subagent' }>,
): string {
  const thought = nextThoughts.find((value) => value.trim());
  if (thought) return compactSentence(thought);
  if (eventSummary) return compactSentence(eventSummary);
  const tool = tools[0];
  if (tool) return `${tool.title ?? tool.name} requested`;
  const task = tasks[0];
  if (task) return compactSentence(task.title);
  if (subagent) {
    return subagent.stage === 'delegate.started' ? 'Child agent started' : 'Child agent returned';
  }
  return terminal ? 'Preparing the final response' : 'Reasoning about the next action';
}

function compactSentence(value: string): string {
  // A one-line summary is plain text: inline markdown markers (a reasoning
  // summary's **heading**, `code`, # levels) are dropped, never shown raw.
  // Some providers emit consecutive summary headings without whitespace. Keep
  // their boundaries readable without rewriting the stored reasoning text.
  const plain = value
    .replace(/(\*\*|__)\s*\1/gu, '$1 · $1')
    .replace(/(\*\*|__|`)/gu, '')
    .replace(/^\s*#{1,6}\s+/gmu, '');
  const line = plain.replace(/\s+/gu, ' ').trim();
  const sentenceEnd = line.search(/(?<=[.!?])\s/u);
  const sentence = (sentenceEnd >= 0 ? line.slice(0, sentenceEnd + 1) : line).trim();
  return truncate(sentence, SUMMARY_TRUNCATE_CHARS);
}
