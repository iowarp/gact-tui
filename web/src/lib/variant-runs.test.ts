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
      steps: [],
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
  payload: {
    question_id: 'q_1',
    metadata: {
      tool_name: 'draft_alternatives',
      variants_id: 'var_1',
      variant: {
        strategy: 'refine',
        judge: 'user',
        n: 3,
        refinable: true,
        candidates: [{ id: 'main#run0', try_index: 0, text: 'A' }],
      },
    },
  },
  actions: ['answer', 'cancel'],
};

describe('variant run anchoring', () => {
  const messages = [
    message('user_1', { role: 'user' }),
    message('answer_1', { turn_id: 'user_1', run_id: 'user_1' }),
    message('user_2', { role: 'user' }),
    message('answer_2'),
  ];

  it("uses the server's anchor message, else the run's first try's", () => {
    expect(variantRunAnchorId({ ...run, anchor_message_id: 'answer_1' }, messages)).toBe(
      'answer_1',
    );
    const tries = [{ ...run.tries[0]!, anchor_message_id: 'answer_2' }];
    expect(variantRunAnchorId({ ...run, tries }, messages)).toBe('answer_2');
  });

  it('places a run with no anchor yet at the answer of its turn', () => {
    // The assistant message carrying the turn id ...
    expect(variantRunAnchorId({ ...run, run_id: 'user_1' }, messages)).toBe('answer_1');
    // ... or the first assistant message after the turn's user message.
    expect(variantRunAnchorId({ ...run, run_id: 'user_2' }, messages)).toBe('answer_2');
    // An anchor this view does not hold falls through to the turn.
    expect(
      variantRunAnchorId({ ...run, anchor_message_id: 'gone', run_id: 'user_2' }, messages),
    ).toBe('answer_2');
  });

  it('places nothing while its turn is not loaded; only a turnless run takes the latest answer', () => {
    expect(variantRunAnchorId({ ...run, run_id: 'user_9' }, messages)).toBeUndefined();
    expect(variantRunAnchorId(run, messages)).toBe('answer_2');
  });
});

describe('variant run view', () => {
  it('reads the pick from the interaction metadata, only while it is answerable', () => {
    expect(variantRunView(run, [pick], []).tabs[0]?.candidateId).toBe('main#run0');
    expect(variantRunView(run, [], []).tabs[0]?.candidateId).toBeUndefined();
    expect(
      variantRunView(run, [{ ...pick, status: 'answered' }], []).tabs[0]?.candidateId,
    ).toBeUndefined();
    const otherRun = { ...pick, payload: { ...pick.payload, metadata: { variants_id: 'var_2' } } };
    expect(variantRunView(run, [otherRun], []).pick).toBeUndefined();
  });

  it('marks the tries the user picked: a refined source and the final pick', () => {
    const tries = [
      run.tries[0]!,
      { ...run.tries[0]!, id: 'var_1:1', try_index: 1, scope: 'main#run1' },
      { ...run.tries[0]!, id: 'var_1:2', try_index: 2, forked_from: 1, advice: 'shorter' },
    ];
    const view = variantRunView(
      {
        ...run,
        tries,
        selection: {
          selected_index: 2,
          selected_scope: 'main#run2',
          text: 'A',
          scores: [],
          pick: 2,
        },
      },
      [],
      [],
    );
    expect(view.tabs.map((tab) => [tab.label, tab.userPick, tab.comment, tab.selected])).toEqual([
      ['Draft 1', false, undefined, false],
      ['Draft 2', true, 'shorter', false],
      ['Draft 3', true, undefined, true],
    ]);
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
