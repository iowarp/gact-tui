import type { Artifact, Message, MessageBlock, ToolInvocation } from '@clio/core/v3';

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

/** Remove only repeated links to the exact same immutable artifact. */
export function deduplicateArtifactBlocks(
  blocks: readonly MessageBlock[],
  artifacts: Record<string, Artifact>,
): MessageBlock[] {
  const latestBlockByArtifact = new Map<string, string>();
  for (const block of blocks) {
    if (block.type !== 'artifact') continue;
    const artifact = artifacts[block.artifact_id];
    if (!artifact) continue;
    latestBlockByArtifact.set(artifact.id, block.id);
  }
  return blocks.filter((block) => {
    if (block.type !== 'artifact') return true;
    const artifact = artifacts[block.artifact_id];
    if (!artifact) return true;
    return latestBlockByArtifact.get(artifact.id) === block.id;
  });
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
  const ordered = message.blocks
    .map((block, position) => ({ block, position }))
    .sort((left, right) => {
      if (left.block.sequence === undefined || right.block.sequence === undefined) {
        return left.position - right.position;
      }
      return left.block.sequence - right.block.sequence;
    });
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

  for (let position = 0; position < ordered.length; position += 1) {
    const block = ordered[position]!.block;
    if (block.type === 'reasoning') {
      if (current.nextThoughts.length > 0 || current.tools.length > 0) flush();
      current.thinking.push({
        id: block.id,
        label: reasoningLabel(block.provider_source),
        text: readableThinking(block.text),
        streaming: Boolean(block.streaming),
      });
      current.streaming ||= Boolean(block.streaming);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'text' && isNextThought(block, ordered, position)) {
      if (current.tools.length > 0) flush();
      current.nextThoughts.push(block.text);
      current.streaming ||= Boolean(block.streaming);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'tool') {
      const tool = tools[block.tool_id];
      if (tool && !current.tools.some((candidate) => candidate.id === tool.id)) {
        current.tools.push(tool);
      }
      if (block.thought && current.nextThoughts.length === 0) {
        current.nextThoughts.push(block.thought);
      }
      current.streaming ||= ['pending', 'running'].includes(tool?.state ?? '');
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

function readableThinking(value: string): string {
  return value.replace(/\*{4}(?=\S)/gu, '**\n\n**');
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

function isNextThought(
  block: Extract<MessageBlock, { type: 'text' }>,
  ordered: Array<{ block: MessageBlock; position: number }>,
  position: number,
): boolean {
  if (block.channel === 'next_thought') return true;
  for (let cursor = position + 1; cursor < ordered.length; cursor += 1) {
    const candidate = ordered[cursor]!.block;
    if (candidate.type === 'tool') return true;
    if (candidate.type === 'reasoning') return false;
    if (candidate.type === 'text' && candidate.channel === 'answer') return false;
  }
  return false;
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
  if (thought) {
    if (isResponseContractRepair(thought)) return 'Finalizing the response';
    return compactSentence(thought);
  }
  if (eventSummary && !/react step/iu.test(eventSummary)) return compactSentence(eventSummary);
  const tool = tools[0];
  if (tool) return `${tool.title ?? humanize(tool.name)} requested`;
  return terminal ? 'Preparing the final response' : 'Reasoning about the next action';
}

function isResponseContractRepair(value: string): boolean {
  return (
    /\b(?:submit|final(?:ize|ization)|response)\b/iu.test(value) &&
    /\b(?:failed|rejected|retry|resubmit)\b/iu.test(value) &&
    /\b(?:required|schema|field|format)\b/iu.test(value)
  );
}

function compactSentence(value: string): string {
  const line = value.replace(/\s+/gu, ' ').trim();
  const sentenceEnd = line.search(/(?<=[.!?])\s/u);
  const sentence = (sentenceEnd >= 0 ? line.slice(0, sentenceEnd + 1) : line).trim();
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence;
}

function humanize(value: string): string {
  return value
    .replace(/^remote_[^_]+_/u, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
