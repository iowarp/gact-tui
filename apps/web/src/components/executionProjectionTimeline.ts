/**
 * Projects the web execution timeline (`projectWebExecutionTimeline`) from
 * the live event stream into ordered timeline rows.
 */
import type { ExecutionTranscriptEvent } from '../live.js';
import {
  isRedacted,
  normalizeLooseComparable,
  objectValue,
  type ProjectedExecutionNode,
  stringValue,
  textQualityScore,
} from './executionProjectionPreview.js';
import {
  delegationCompletedPayload,
  delegationStartedPayload,
  expertIdFromPayload,
  messageDeltaText,
  messagePartActor,
} from './executionProjectionEventModel.js';

/** The real, unredacted result recovered from a `tool.call.completed` event. */
interface CompletedToolResult {
  result: string;
  isError: boolean;
  durationMs?: number;
}

export function projectWebExecutionTimeline(
  events: ExecutionTranscriptEvent[],
): ProjectedExecutionNode[] {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const nodes: ProjectedExecutionNode[] = [];
  let buffer = '';
  let currentAgent = 'main';
  const handoffQuestions = new Map<string, string>();
  const reportedAgents = new Set<string>();
  // The REAL tool results, recovered from `tool.call.completed` (whose
  // `payload.result` carries the unredacted data the `react.step` observation
  // strips). Keyed by tool name → FIFO queue, plus a global FIFO fallback for
  // backends that omit a tool name on the completion event. Consumed when a
  // `react.step.completed` for the same tool appears.
  const toolNameOf = new Map<string, string>(); // call_id → tool_name (from started)
  const resultsByTool = new Map<string, CompletedToolResult[]>();
  const resultsFifo: CompletedToolResult[] = [];
  const takeToolResult = (toolName: string): CompletedToolResult | undefined => {
    const byName = resultsByTool.get(toolName);
    if (byName && byName.length) {
      const next = byName.shift()!;
      const gi = resultsFifo.indexOf(next);
      if (gi >= 0) resultsFifo.splice(gi, 1);
      return next;
    }
    return resultsFifo.shift();
  };
  // Generic delegation depth: the root agent is 0; every delegated child is its
  // parent's depth + 1. Built from the live delegation graph — no agent-name
  // list. Unknown agents default to depth 0 until a delegation places them.
  const depthByAgent = new Map<string, number>([['main', 0]]);
  const depthOf = (agent: string): number => depthByAgent.get(agent.trim() || 'main') ?? 0;
  const placeChild = (parent: string, child: string): number => {
    const d = depthOf(parent) + 1;
    if (child) depthByAgent.set(child.trim(), d);
    return d;
  };
  const switchTextAgent = (agent: string) => {
    const next = agent.trim() || 'main';
    if (currentAgent === next) return;
    flushText();
    currentAgent = next;
  };
  const flushText = () => {
    const text = buffer.trim();
    buffer = '';
    if (!text) return;
    const comparable = normalizeLooseComparable(text);
    const duplicate = nodes.find(
      (node) =>
        node.kind === 'text' &&
        node.agent === (currentAgent || 'main') &&
        normalizeLooseComparable(node.text ?? '') === comparable,
    );
    if (duplicate) {
      if (textQualityScore(text) > textQualityScore(duplicate.text ?? '')) duplicate.text = text;
      return;
    }
    nodes.push({
      kind: 'text',
      agent: currentAgent || 'main',
      depth: depthOf(currentAgent),
      text,
    });
  };
  for (const event of ordered) {
    if (event.type === 'message.part.delta') {
      switchTextAgent(messagePartActor(event, currentAgent));
      buffer += messageDeltaText(event);
      continue;
    }
    if (event.type === 'message.part.added') {
      const part = event.part;
      if (part?.type === 'text') {
        switchTextAgent(messagePartActor(event));
        buffer += part.text ?? '';
      }
      if (part?.type === 'expert_handoff') {
        const meta = part.metadata ?? {};
        const parent = stringValue(meta['parent_id']) || stringValue(meta['parent']) || 'main';
        const agent = stringValue(meta['agent_id']) || stringValue(meta['delegate_to']);
        const question = stringValue(meta['question']);
        if (agent && question && !isRedacted(question)) {
          handoffQuestions.set(`${parent}->${agent}`, question);
          const existing = nodes.find(
            (n) => n.kind === 'handoff' && n.parent === parent && n.agent === agent && !n.question,
          );
          if (existing) existing.question = question;
        }
      }
      continue;
    }
    if (event.type === 'expert.lifecycle.started') {
      flushText();
      currentAgent = expertIdFromPayload(event, currentAgent);
      continue;
    }
    if (event.type === 'blueprint.delegation.started') {
      flushText();
      const handoff = delegationStartedPayload(event);
      const { parent, agent } = handoff;
      let { question } = handoff;
      if (isRedacted(question)) question = handoffQuestions.get(`${parent}->${agent}`) ?? '';
      nodes.push({ kind: 'handoff', agent, parent, depth: placeChild(parent, agent), question });
      if (agent) currentAgent = agent;
      continue;
    }
    if (event.type === 'react.step.completed') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      const agent = expertIdFromPayload(event, currentAgent);
      const toolName = stringValue(payload['tool_name']);
      // Recover the REAL tool result from the matching `tool.call.completed`
      // event; the step's own `observation` is redacted.
      const completed = toolName ? takeToolResult(toolName) : undefined;
      nodes.push({
        kind: 'step',
        agent,
        depth: depthOf(agent),
        text: stringValue(payload['thought']),
        reasoning: stringValue(payload['reasoning']),
        toolName,
        toolArgs: payload['tool_args'],
        observation: payload['observation'],
        isFinish: Boolean(payload['is_finish']),
        ...(completed?.result ? { toolResult: completed.result } : {}),
        ...(completed?.isError ? { toolError: true } : {}),
        ...(completed?.durationMs != null ? { toolDurationMs: completed.durationMs } : {}),
      });
      continue;
    }
    if (event.type === 'expert.extract.completed') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      const agent = expertIdFromPayload(event, currentAgent);
      reportedAgents.add(agent);
      nodes.push({
        kind: 'report',
        agent,
        depth: depthOf(agent),
        text: stringValue(payload['output']),
        structured: payload['structured'],
      });
      continue;
    }
    if (event.type === 'blueprint.delegation.completed') {
      flushText();
      const { agent, parent, text } = delegationCompletedPayload(event);
      if (reportedAgents.has(agent)) {
        currentAgent = parent || currentAgent;
        continue;
      }
      nodes.push({
        kind: 'report',
        agent,
        parent,
        depth: placeChild(parent, agent),
        text,
      });
      currentAgent = parent || currentAgent;
      continue;
    }
    if (event.type === 'tool.call.started') {
      const payload = objectValue(event.payload['payload']);
      const callId = stringValue(event.payload['call_id']) || stringValue(payload['call_id']);
      const toolName =
        stringValue(event.payload['tool_name']) || stringValue(payload['tool_name']);
      if (callId && toolName) toolNameOf.set(callId, toolName);
      continue;
    }
    if (event.type === 'tool.call.completed') {
      const payload = objectValue(event.payload['payload']);
      const callId = stringValue(event.payload['call_id']) || stringValue(payload['call_id']);
      // The REAL result lives in `payload.result` on the dedicated completion
      // event (the semantic `react.step` copy is redacted). It may be a string
      // or an arbitrary structured value.
      const rawResult =
        event.payload['result'] ?? payload['result'] ?? event.payload['output'] ?? payload['output'];
      const resultStr =
        typeof rawResult === 'string'
          ? rawResult
          : rawResult == null
            ? ''
            : JSON.stringify(rawResult);
      if (isRedacted(resultStr) || !resultStr) continue;
      const toolName =
        stringValue(event.payload['tool_name']) ||
        stringValue(payload['tool_name']) ||
        (callId ? toolNameOf.get(callId) ?? '' : '');
      const isError =
        event.payload['is_error'] === true || payload['is_error'] === true;
      const durationRaw = event.payload['duration_ms'] ?? payload['duration_ms'];
      const completed: CompletedToolResult = {
        result: resultStr,
        isError,
        ...(typeof durationRaw === 'number' ? { durationMs: durationRaw } : {}),
      };
      if (toolName) {
        resultsByTool.set(toolName, [...(resultsByTool.get(toolName) ?? []), completed]);
      }
      resultsFifo.push(completed);
      continue;
    }
  }
  flushText();
  return nodes.filter((n) => !isRedacted(n.text ?? '') && !isRedacted(n.question ?? ''));
}
