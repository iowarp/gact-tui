import type { SubagentRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { getChildAgentAssignment } from './child-agent-presentation';

function subagent(overrides: Partial<SubagentRun> = {}): SubagentRun {
  return {
    id: 'task-1',
    session_id: 'session-1',
    title: 'EarthScope region',
    state: 'running',
    ...overrides,
  };
}

describe('child-agent presentation', () => {
  it('uses the authoritative task before the summary', () => {
    expect(
      getChildAgentAssignment(
        subagent({ task: 'Resolve Los Angeles.', summary: 'Region work is running.' }),
      ),
    ).toEqual({ label: 'Resolve Los Angeles.' });
  });

  it('uses the authoritative summary when no task was supplied', () => {
    expect(getChildAgentAssignment(subagent({ summary: 'Region work is running.' }))).toEqual({
      label: 'Region work is running.',
    });
  });

  it('uses the audited generic fallback without scoring prose', () => {
    expect(getChildAgentAssignment(subagent())).toEqual({ label: 'Delegated work' });
  });
});
