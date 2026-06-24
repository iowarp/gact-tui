/**
 * Maps raw semantic/tool events to projection actors/agents
 * (`eventActorAgent`, …) for the execution-tree projection.
 */
import type { ExecutionTranscriptEvent } from '../live.js';
import { objectValue, stringValue } from './executionProjectionPreview.js';

export function eventActorAgent(
  event: ExecutionTranscriptEvent,
  fallback = '',
): string {
  return stringValue(objectValue(event.payload['actor'])['agent_id']) || fallback;
}

export function eventSubjectAgent(event: ExecutionTranscriptEvent): string {
  return stringValue(objectValue(event.payload['subject'])['agent_id']);
}

export function messageDeltaText(event: ExecutionTranscriptEvent): string {
  return stringValue(objectValue(event.payload['delta'])['text_append']);
}

export function messagePartActor(event: ExecutionTranscriptEvent, fallback = 'main'): string {
  return eventActorAgent(event, fallback);
}

export function reactStepSpanId(event: ExecutionTranscriptEvent): string {
  const payload = objectValue(event.payload['payload']);
  return stringValue(payload['step_span_id']) || stringValue(event.payload['parent_span_id']);
}

export interface HandoffPayload {
  parent: string;
  agent: string;
  question: string;
}

export function delegationStartedPayload(event: ExecutionTranscriptEvent): HandoffPayload {
  const payload = objectValue(event.payload['payload']);
  const parent = stringValue(payload['parent_id']) || eventActorAgent(event) || 'main';
  const agent =
    stringValue(payload['delegate_to']) ||
    stringValue(payload['agent_id']) ||
    eventSubjectAgent(event);
  return {
    parent,
    agent,
    question: stringValue(payload['question']),
  };
}

export function delegationCompletedPayload(event: ExecutionTranscriptEvent): {
  agent: string;
  parent: string;
  text: string;
} {
  const payload = objectValue(event.payload['payload']);
  return {
    agent:
      stringValue(payload['delegate_to']) ||
      stringValue(payload['agent_id']) ||
      eventActorAgent(event),
    parent:
      stringValue(payload['return_to']) ||
      stringValue(payload['parent_id']) ||
      eventSubjectAgent(event),
    text:
      stringValue(payload['output_summary']) ||
      stringValue(payload['return_output_summary']) ||
      stringValue(event.payload['summary']),
  };
}

export function expertIdFromPayload(
  event: ExecutionTranscriptEvent,
  fallback = '',
): string {
  const payload = objectValue(event.payload['payload']);
  return stringValue(payload['expert_id']) || eventActorAgent(event, fallback);
}
