import type { AgentTaskRecord, AsyncProcess, SubagentRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { agentTaskToSubagent, matchesRunState, mergeSessionSubagents } from './session-agent-tasks';

describe('Runs state filtering', () => {
  it('keeps lost-visibility work discoverable as active and needing attention', () => {
    expect(matchesRunState('task_state_uncertain', 'attention')).toBe(true);
    expect(matchesRunState('task_state_uncertain', 'active')).toBe(true);
    expect(matchesRunState('task_state_uncertain', 'completed')).toBe(false);
    expect(matchesRunState('completed', 'attention')).toBe(false);
    expect(matchesRunState('running', 'attention')).toBe(false);
  });
});

function task(overrides: Partial<AgentTaskRecord>): AgentTaskRecord {
  return {
    task_id: 'task_1',
    parent_session_id: 'sess_parent',
    child_session_id: 'sess_child',
    parent_turn_id: '',
    expert_id: 'researcher',
    run_index: 0,
    run_label: '',
    status: 'completed',
    live_state: 'completed',
    error_reason: '',
    created_at: '2026-09-27T10:00:00Z',
    updated_at: '2026-09-27T10:00:00Z',
    answer_excerpt: '',
    ...overrides,
  };
}

describe('agentTaskToSubagent', () => {
  it.each([
    ['busy', 'running'],
    ['executing', 'running'],
    ['active', 'running'],
    ['idle', 'yielded'],
    ['yielded', 'yielded'],
    ['stopping', 'stopping'],
    ['paused', 'paused'],
    ['cancelling', 'cancellation_requested'],
    ['waiting_for_input', 'waiting_user'],
    ['input_required', 'waiting_user'],
    ['accepted', 'queued'],
    ['submitting', 'queued'],
    ['recovering', 'recovering'],
    ['task_state_uncertain', 'task_state_uncertain'],
  ])('renders the service state %s as %s', (activity, expected) => {
    expect(agentTaskToSubagent(task({ status: 'active', live_state: activity })).state).toBe(
      expected,
    );
  });

  it('shows a standing SPOTTER watcher between checks as a live child, not interrupted', () => {
    const watcher = agentTaskToSubagent(
      task({
        task_id: 'task_watch',
        expert_id: 'spotter_watcher',
        run_label: 'SPOTTER watcher',
        status: 'running',
        live_state: 'waiting',
      }),
    );
    expect(watcher).toMatchObject({
      id: 'task_watch',
      session_id: 'sess_parent',
      child_session_id: 'sess_child',
      title: 'SPOTTER watcher',
      state: 'running',
    });
  });

  it('names an unlabelled task after its agent and run number, like the live projection', () => {
    expect(agentTaskToSubagent(task({ run_index: 2 })).title).toBe('researcher #3');
    expect(agentTaskToSubagent(task({ status: 'mystery', live_state: '' })).state).toBe('unknown');
  });
});

describe('mergeSessionSubagents', () => {
  function process(overrides: Partial<AsyncProcess> = {}): AsyncProcess {
    return {
      id: 'task_1',
      handle: 'task_1',
      task_kind: 'Subagent',
      kind: 'agent',
      title: 'Recorded child',
      description: 'Original assignment',
      parent_session_id: 'sess_parent',
      owner_session_id: 'sess_child',
      live_state: 'running',
      status: 'active',
      metadata: {},
      ...overrides,
    };
  }
  const live: SubagentRun = {
    id: 'task_1',
    session_id: 'sess_parent',
    child_session_id: 'sess_child',
    title: 'researcher #1',
    state: 'interrupted',
    task: 'Compare the records.',
    duration_ms: 1200,
  };

  it('lists children from the same loaded work page without requiring a live record', () => {
    const merged = mergeSessionSubagents(
      [],
      [process({ id: 'task_watch', handle: 'task_watch', title: 'SPOTTER watcher' })],
    );
    expect(merged.map((row) => row.id)).toEqual(['task_watch']);
  });

  it('takes state and assignment from the shared work page and retains live output and duration', () => {
    const [merged] = mergeSessionSubagents([live], [process()]);
    expect(merged).toMatchObject({
      state: 'running',
      task: 'Original assignment',
      duration_ms: 1200,
      title: 'researcher #1',
      child_session_id: 'sess_child',
    });
  });

  it('keeps live-only records after the page rows and passes live through without a page', () => {
    const other: SubagentRun = { ...live, id: 'task_new', child_session_id: 'sess_new' };
    expect(mergeSessionSubagents([other], [process()]).map((row) => row.id)).toEqual([
      'task_1',
      'task_new',
    ]);
    expect(mergeSessionSubagents([live], undefined)).toEqual([live]);
  });

  it('does not manufacture child rows for Shell or Session tasks', () => {
    const otherKinds = [
      process({ task_kind: 'Shell', kind: 'mcp' }),
      process({ task_kind: 'Session' }),
    ];
    expect(mergeSessionSubagents([live], otherKinds)).toEqual([live]);
  });
});
