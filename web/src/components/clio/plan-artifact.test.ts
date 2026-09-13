import type { Artifact, PendingInteraction } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { planArtifact } from './plan-artifact';

const oldPlan: Artifact = {
  id: 'plan_v1', session_id: 'session', name: 'plan.md', media_type: 'text/markdown',
  uri: 'artifact://plan_v1',
};
const reviewedPlan: Artifact = { ...oldPlan, id: 'plan_v3' };
const artifacts = { plan_v1: oldPlan, plan_v3: reviewedPlan };

function interaction(artifactId?: string): PendingInteraction {
  return {
    id: 'review', kind: 'question', owner_session_id: 'session', attended_session_id: 'session',
    status: 'answered', title: 'Review execution plan', created_at: '2026-09-08T00:00:00Z',
    source: { protocol: 'native', tool_name: 'plan_exit' },
    payload: { plan_exit: {
      plan_file: 'D:/plans/plan.md',
      ...(artifactId ? { artifact_ref: { artifact_id: artifactId, saved: true } } : {}),
    } },
  };
}

describe('registered plan artifact identity', () => {
  it('opens the exact reviewed version when multiple versions share a filename', () => {
    expect(planArtifact(interaction('plan_v3'), artifacts)).toBe(reviewedPlan);
    expect(planArtifact(interaction('plan_v1'), artifacts)).toBe(oldPlan);
  });
  it('never substitutes a same-name artifact when the registered reference is unavailable', () => {
    expect(planArtifact(interaction('missing'), artifacts)).toBeUndefined();
    expect(planArtifact(interaction(), artifacts)).toBeUndefined();
  });
});
