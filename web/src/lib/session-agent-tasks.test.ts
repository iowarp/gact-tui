import type { AgentTaskRecord, SubagentRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  agentTaskToSubagent,
  liveSubagentSignature,
  mergeSessionSubagents,
} from './session-agent-tasks';

function task(overrides: Partial<AgentTaskRecord>): AgentTaskRecord {
  return {
    task_id: 'task_1',
    parent_session_id: 'sess_parent',
    child_session_id: 'sess_child',
    parent_turn_id: '',
    expert_id: 'researcher',
    blueprint_id: '',
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
  const live: SubagentRun = {
    id: 'task_1',
    session_id: 'sess_parent',
    child_session_id: 'sess_child',
    title: 'researcher #1',
    state: 'interrupted',
    task: 'Compare the records.',
    duration_ms: 1200,
  };

  it('lists registry-only tasks that no live record or transcript mentions', () => {
    const merged = mergeSessionSubagents(
      [],
      [task({ task_id: 'task_watch', run_label: 'SPOTTER watcher', status: 'running' })],
    );
    expect(merged.map((row) => row.id)).toEqual(['task_watch']);
  });

  it('takes state from the registry and keeps what only the live record carries', () => {
    const [merged] = mergeSessionSubagents(
      [live],
      [task({ status: 'running', live_state: 'waiting' })],
    );
    expect(merged).toMatchObject({
      state: 'running',
      task: 'Compare the records.',
      duration_ms: 1200,
    });
  });

  it('keeps live-only records after the registry rows and passes live through without a read', () => {
    const other: SubagentRun = { ...live, id: 'task_new', child_session_id: 'sess_new' };
    expect(mergeSessionSubagents([other], [task({})]).map((row) => row.id)).toEqual([
      'task_1',
      'task_new',
    ]);
    expect(mergeSessionSubagents([live], undefined)).toEqual([live]);
  });

  it('changes the live signature when a record changes state', () => {
    expect(liveSubagentSignature([live])).not.toBe(
      liveSubagentSignature([{ ...live, state: 'completed' }]),
    );
  });
});
