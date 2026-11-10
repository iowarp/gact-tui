import { describe, expect, it } from 'vitest';
import { agentAvailabilityLabel } from './connection-names';

describe('agentAvailabilityLabel', () => {
  it('reads Live for the current agent and Online for another that answers', () => {
    const healthy = { state: 'healthy', label: 'Ready' } as const;
    expect(agentAvailabilityLabel(healthy, true)).toBe('Live');
    expect(agentAvailabilityLabel(healthy, false)).toBe('Online');
  });

  it('reads Offline for an agent that does not answer, whatever the observed reason', () => {
    expect(agentAvailabilityLabel({ state: 'unavailable', label: 'Not reachable' }, false)).toBe(
      'Offline',
    );
  });

  it('keeps the word for a starting, checking or limited agent', () => {
    expect(agentAvailabilityLabel({ state: 'checking', label: 'Starting' }, true)).toBe('Starting');
    expect(agentAvailabilityLabel({ state: 'degraded', label: 'Limited' }, false)).toBe('Limited');
  });
});
