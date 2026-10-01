import type { Message, PendingInteraction, VariantRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { responseTrayInteractions } from '@/components/clio/workspace-route-state';
import { variantRunAnchorId, variantRunView } from './variant-runs';

function message(id: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    session_id: 'sess_1',
    role: 'assistant',
    created_at: '2026-10-01T12:00:00Z',
    blocks: [],
    ...extra,
  };
}

const run: VariantRun = {
  variants_id: 'var_1',
  session_id: 'sess_1',
  agent_id: 'main',
  origin: 'draft_alternatives',
  strategy: 'refine',
  judge: 'user',
  n: 3,
  tries: [
    {
      id: 'var_1:0',
      variants_id: 'var_1',
      try_index: 0,
      scope: 'main#run0',
      state: 'completed',
      text: 'A',
      thinking: '',
      activity: [],
    },
  ],
  questions: [
    {
      id: 'q_1',
      session_id: 'sess_1',
      status: 'pending',
      prompt: 'Pick',
      refinable: true,
      candidates: [{ id: 'main#run0', try_index: 0, text: 'A' }],
      selected_options: [],
      created_at: '2026-10-01T12:00:10Z',
    },
  ],
};

const pick: PendingInteraction = {
  id: 'question:q_1',
  kind: 'question',
  owner_session_id: 'sess_1',
  attended_session_id: 'sess_1',
  status: 'pending',
  title: 'Question from agent',
  source: { protocol: 'native', tool_name: 'draft_alternatives', invocation_id: 'call_draft' },
  created_at: '2026-10-01T12:00:10Z',
  payload: { question_id: 'q_1' },
  actions: ['answer', 'cancel'],
};

describe('variant run anchoring', () => {
  it('belongs to the first assistant message of the turn it started in', () => {
    const messages = [
      message('user', { role: 'user', run_id: 'turn_1' }),
      message('first', { run_id: 'turn_1' }),
      message('second', { run_id: 'turn_1' }),
      message('later', { run_id: 'turn_2' }),
    ];
    expect(variantRunAnchorId({ ...run, run_id: 'turn_1' }, messages, [])).toBe('first');
  });

  it('falls back to the tool call that asked its pick, then the latest answer', () => {
    const asked = message('asked', {
      blocks: [{ id: 'b', type: 'tool', tool_id: 'call_draft' }],
    });
    const latest = message('latest');
    expect(variantRunAnchorId(run, [asked, latest], [pick])).toBe('asked');
    expect(variantRunAnchorId(run, [asked, latest], [])).toBe('latest');
  });
});

describe('variant run view', () => {
  it('offers the pick only while its interaction is answerable', () => {
    expect(variantRunView(run, [pick], []).tabs[0]?.candidateId).toBe('main#run0');
    expect(variantRunView(run, [], []).tabs[0]?.candidateId).toBeUndefined();
    expect(
      variantRunView(run, [{ ...pick, status: 'answered' }], []).tabs[0]?.candidateId,
    ).toBeUndefined();
  });

  it('keeps a draft pick out of the response tray even when its tool call is not loaded', () => {
    const other: PendingInteraction = {
      ...pick,
      id: 'question:q_2',
      source: { protocol: 'native' },
    };
    expect(responseTrayInteractions([pick, other], new Set())).toEqual([other]);
  });
});
