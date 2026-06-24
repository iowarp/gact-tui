import { describe, expect, it } from 'vitest';
import type { ExecutionTranscriptEvent } from '../../src/live.js';
import {
  delegationCompletedPayload,
  delegationStartedPayload,
  eventActorAgent,
  eventSubjectAgent,
  expertIdFromPayload,
  messageDeltaText,
  messagePartActor,
  reactStepSpanId,
} from '../../src/components/executionProjectionEventModel.js';

function event(
  type: string,
  payload: Record<string, unknown>,
): ExecutionTranscriptEvent {
  return { sequence: 1, type, payload };
}

describe('executionProjectionEventModel', () => {
  it('reads actor, subject, and message delta fields with fallbacks', () => {
    const ev = event('message.part.delta', {
      actor: { agent_id: 'data' },
      subject: { agent_id: 'ndp_dataset_discovery' },
      delta: { text_append: 'hello' },
    });
    expect(eventActorAgent(ev)).toBe('data');
    expect(eventActorAgent(event('x', {}), 'main')).toBe('main');
    expect(eventSubjectAgent(ev)).toBe('ndp_dataset_discovery');
    expect(messageDeltaText(ev)).toBe('hello');
    expect(messagePartActor(ev)).toBe('data');
    expect(messagePartActor(event('x', {}))).toBe('main');
  });

  it('resolves react step spans from payload or event parent span', () => {
    expect(
      reactStepSpanId(event('react.step.completed', {
        payload: { step_span_id: 'step-1' },
        parent_span_id: 'parent-1',
      })),
    ).toBe('step-1');
    expect(
      reactStepSpanId(event('react.step.completed', {
        payload: {},
        parent_span_id: 'parent-1',
      })),
    ).toBe('parent-1');
  });

  it('normalizes delegation started payloads', () => {
    expect(
      delegationStartedPayload(event('blueprint.delegation.started', {
        actor: { agent_id: 'main' },
        payload: {
          delegate_to: 'geospatial',
          question: 'Resolve San Diego',
        },
      })),
    ).toEqual({
      parent: 'main',
      agent: 'geospatial',
      question: 'Resolve San Diego',
    });
  });

  it('normalizes delegation completed payloads', () => {
    expect(
      delegationCompletedPayload(event('blueprint.delegation.completed', {
        subject: { agent_id: 'main' },
        payload: {
          agent_id: 'geospatial',
          return_output_summary: 'resolved region',
        },
        summary: 'fallback summary',
      })),
    ).toEqual({
      agent: 'geospatial',
      parent: 'main',
      text: 'resolved region',
    });
  });

  it('resolves expert ids from event payload before actor fallback', () => {
    expect(
      expertIdFromPayload(event('expert.lifecycle.started', {
        actor: { agent_id: 'fallback' },
        payload: { expert_id: 'analysis' },
      })),
    ).toBe('analysis');
    expect(
      expertIdFromPayload(event('expert.lifecycle.started', {
        actor: { agent_id: 'fallback' },
        payload: {},
      })),
    ).toBe('fallback');
  });
});
