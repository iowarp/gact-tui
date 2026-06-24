/**
 * Projects the web execution timeline (`projectWebExecutionTimeline`) from
 * the live event stream into ordered timeline rows.
 */
import type { ExecutionTranscriptEvent } from '../live.js';
import {
  agentDepth,
  handoffDepth,
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

export function projectWebExecutionTimeline(
  events: ExecutionTranscriptEvent[],
): ProjectedExecutionNode[] {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const nodes: ProjectedExecutionNode[] = [];
  let buffer = '';
  let currentAgent = 'main';
  const handoffQuestions = new Map<string, string>();
  const reportedAgents = new Set<string>();
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
      depth: agentDepth(currentAgent),
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
      nodes.push({ kind: 'handoff', agent, parent, depth: handoffDepth(parent, agent), question });
      if (agent) currentAgent = agent;
      continue;
    }
    if (event.type === 'react.step.completed') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      const agent = expertIdFromPayload(event, currentAgent);
      nodes.push({
        kind: 'step',
        agent,
        depth: agentDepth(agent),
        text: stringValue(payload['thought']),
        reasoning: stringValue(payload['reasoning']),
        toolName: stringValue(payload['tool_name']),
        toolArgs: payload['tool_args'],
        observation: payload['observation'],
        isFinish: Boolean(payload['is_finish']),
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
        depth: agentDepth(agent),
        text: stringValue(payload['output']) || stringValue(payload['result_summary']),
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
        depth: handoffDepth(parent, agent),
        text,
      });
      currentAgent = parent || currentAgent;
      continue;
    }
    if (isToolCallEvent(event)) {
      continue;
    }
  }
  flushText();
  return nodes.filter((n) => !isRedacted(n.text ?? '') && !isRedacted(n.question ?? ''));
}

function isToolCallEvent(event: ExecutionTranscriptEvent): boolean {
  return event.type === 'tool.call.started' || event.type === 'tool.call.completed';
}
