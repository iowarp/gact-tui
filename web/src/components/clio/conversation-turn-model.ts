import type {
  AgentIteration,
  Message,
  MessageBlock,
  ModelReasoningCall,
  ToolInvocation,
} from '@clio/core/v3';

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
  tool?: ToolInvocation;
  terminal: boolean;
  interrupted: boolean;
  streaming: boolean;
  summary: string;
}

export interface SupplementalModelCall {
  id: string;
  label: string;
  question?: string;
  thinking: string;
  response?: string;
}

export interface ConversationTurnPresentation {
  iterations: ConversationIteration[];
  residualBlocks: MessageBlock[];
  supplementalCalls: SupplementalModelCall[];
  authoritative: boolean;
}

/** Build one lossless turn view from exact semantic iterations, with a transcript fallback. */
export function conversationTurnPresentation(
  message: Message,
  authoritativeIterations: readonly AgentIteration[],
  tools: Record<string, ToolInvocation>,
): ConversationTurnPresentation {
  const turnId = message.run_id;
  const exact = turnId
    ? authoritativeIterations
        .filter((iteration) => iteration.turn_id === turnId)
        .sort((left, right) => left.step_index - right.step_index)
    : [];

  if (exact.length > 0) {
    const authoritative = exact.map((iteration, index) => fromAuthoritative(iteration, index));
    const fallback = fallbackIterations(message, tools);
    const iterations = mergeTranscriptIterations(authoritative, fallback.iterations);
    return {
      iterations,
      residualBlocks: message.blocks.filter(
        (block) => !conversationIterationOwnsBlock(block, iterations, tools),
      ),
      supplementalCalls: supplementalModelCalls(iterations, message.reasoning_calls ?? []),
      authoritative: true,
    };
  }

  const { iterations, consumed } = fallbackIterations(message, tools);
  return {
    iterations,
    residualBlocks: message.blocks.filter((block) => !consumed.has(block.id)),
    supplementalCalls: supplementalModelCalls(iterations, message.reasoning_calls ?? []),
    authoritative: false,
  };
}

function fromAuthoritative(iteration: AgentIteration, index: number): ConversationIteration {
  const tool = iteration.tool
    ? {
        id: iteration.tool.id,
        session_id: iteration.session_id,
        run_id: iteration.turn_id,
        name: iteration.tool.name,
        state: iteration.tool.state,
        input: iteration.tool.input,
        output: iteration.tool.output,
      }
    : undefined;
  const nextThoughts = iteration.next_thought ? [iteration.next_thought] : [];
  return {
    id: iteration.id,
    index,
    agentId: iteration.agent_id,
    thinking: iteration.thinking
      ? [
          {
            id: `${iteration.id}:thinking`,
            label: 'Agent reasoning',
            text: readableThinking(iteration.thinking),
            streaming: false,
          },
        ]
      : [],
    nextThoughts,
    tool,
    terminal: iteration.terminal,
    interrupted: false,
    streaming: iteration.tool?.state === 'running',
    summary: iterationSummary(nextThoughts, tool, iteration.terminal, iteration.summary),
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
      current.tool,
      current.terminal,
      current.thinking.at(-1)?.text,
    );
    iterations.push(current);
    current = emptyIteration(message, iterations.length);
  };

  for (let position = 0; position < ordered.length; position += 1) {
    const block = ordered[position]!.block;
    if (block.type === 'reasoning') {
      if (current.nextThoughts.length > 0 || current.tool) flush();
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
      if (current.tool) flush();
      current.nextThoughts.push(block.text);
      current.streaming ||= Boolean(block.streaming);
      consumed.add(block.id);
      continue;
    }
    if (block.type === 'tool') {
      current.tool = tools[block.tool_id];
      if (block.thought && current.nextThoughts.length === 0) {
        current.nextThoughts.push(block.thought);
      }
      current.streaming ||= ['pending', 'running'].includes(current.tool?.state ?? '');
      consumed.add(block.id);
      flush(false);
      continue;
    }
    if (hasIterationContent(current)) {
      const finalAnswerBoundary = block.type === 'text' && block.channel === 'answer';
      flush(finalAnswerBoundary && !current.tool);
    }
  }
  flush(messageCompletedNormally(message), messageInterrupted(message));
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
    terminal: false,
    interrupted: false,
    streaming: false,
    summary: '',
  };
}

function hasIterationContent(iteration: ConversationIteration): boolean {
  return (
    iteration.thinking.length > 0 || iteration.nextThoughts.length > 0 || Boolean(iteration.tool)
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

function conversationIterationOwnsBlock(
  block: MessageBlock,
  iterations: readonly ConversationIteration[],
  tools: Record<string, ToolInvocation>,
): boolean {
  if (block.type === 'text') {
    if (block.channel === 'answer') return false;
    const text = normalize(block.text);
    return iterations.some((iteration) =>
      iteration.nextThoughts.some((thought) => normalize(thought) === text),
    );
  }
  if (block.type === 'reasoning') {
    const text = normalize(readableThinking(block.text));
    return iterations.some((iteration) =>
      iteration.thinking.some((thinking) => normalize(thinking.text) === text),
    );
  }
  if (block.type === 'tool') {
    const tool = tools[block.tool_id];
    return Boolean(tool && iterations.some((iteration) => iteration.tool?.id === tool.id));
  }
  return false;
}

function mergeTranscriptIterations(
  authoritative: ConversationIteration[],
  transcript: ConversationIteration[],
): ConversationIteration[] {
  const claimed = new Set<string>();
  const merged = authoritative.map((iteration) => {
    const match = transcript
      .filter((candidate) => !claimed.has(candidate.id))
      .map((candidate) => ({ candidate, score: iterationMatchScore(iteration, candidate) }))
      .sort((left, right) => right.score - left.score)[0];
    if (!match || match.score < 2) return iteration;
    claimed.add(match.candidate.id);
    const thinking = deduplicateThinking([...iteration.thinking, ...match.candidate.thinking]);
    const nextThoughts = deduplicateText([
      ...iteration.nextThoughts,
      ...match.candidate.nextThoughts,
    ]);
    const tool = matchingTool(iteration.tool, match.candidate.tool);
    return {
      ...iteration,
      thinking,
      nextThoughts,
      tool,
      streaming: iteration.streaming || match.candidate.streaming,
      summary: iterationSummary(nextThoughts, tool, iteration.terminal),
    };
  });
  const active = transcript.filter(
    (iteration) => !claimed.has(iteration.id) && iteration.streaming,
  );
  return [...merged, ...active].map((iteration, index) => ({ ...iteration, index }));
}

function iterationMatchScore(
  authoritative: ConversationIteration,
  transcript: ConversationIteration,
): number {
  const authoritativeThoughts = new Set(authoritative.nextThoughts.map(normalize));
  const matchingThought = transcript.nextThoughts.some((thought) =>
    authoritativeThoughts.has(normalize(thought)),
  );
  const matchingTool = Boolean(
    authoritative.tool && transcript.tool && authoritative.tool.name === transcript.tool.name,
  );
  return (matchingThought ? 3 : 0) + (matchingTool ? 2 : 0);
}

function matchingTool(
  authoritative: ToolInvocation | undefined,
  transcript: ToolInvocation | undefined,
): ToolInvocation | undefined {
  if (authoritative && transcript && authoritative.name === transcript.name) return transcript;
  return authoritative ?? transcript;
}

function deduplicateThinking(
  thinking: Array<{ id: string; text: string; label: string; streaming: boolean }>,
): Array<{ id: string; text: string; label: string; streaming: boolean }> {
  const seen = new Set<string>();
  return thinking.filter((entry) => {
    const text = normalize(entry.text);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function deduplicateText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const text = normalize(value);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function supplementalModelCalls(
  iterations: readonly ConversationIteration[],
  calls: readonly ModelReasoningCall[],
): SupplementalModelCall[] {
  const represented = new Set(
    iterations.flatMap((iteration) =>
      iteration.thinking.map((thinking) => normalize(thinking.text)),
    ),
  );
  const supplemental: SupplementalModelCall[] = [];
  for (const call of calls) {
    const text = normalize(readableThinking(call.reasoning));
    if (!text || represented.has(text)) continue;
    supplemental.push({
      id: call.id,
      label: modelReasoningLabel(call),
      question: call.question,
      thinking: readableThinking(call.reasoning),
      response: call.response,
    });
    represented.add(text);
  }
  return supplemental;
}

function modelReasoningLabel(_call: ModelReasoningCall): string {
  return 'Thinking';
}

function reasoningLabel(_provider?: string): string {
  return 'Thinking';
}

function iterationSummary(
  nextThoughts: readonly string[],
  tool: ToolInvocation | undefined,
  terminal: boolean,
  eventSummary?: string,
): string {
  const thought = nextThoughts.find((value) => value.trim());
  if (thought) return compactSentence(thought);
  if (eventSummary && !/react step/iu.test(eventSummary)) return compactSentence(eventSummary);
  if (tool) return `${tool.title ?? humanize(tool.name)} requested`;
  return terminal ? 'Preparing the final response' : 'Reasoning about the next action';
}

function compactSentence(value: string): string {
  const line = value.replace(/\s+/gu, ' ').trim();
  const sentenceEnd = line.search(/(?<=[.!?])\s/u);
  const sentence = sentenceEnd >= 0 ? line.slice(0, sentenceEnd + 1) : line;
  return sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence;
}

function humanize(value: string): string {
  return value
    .replace(/^remote_[^_]+_/u, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}
