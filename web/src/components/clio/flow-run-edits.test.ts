import { flowRunSchema, type PendingInteraction } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { editOutcomeText, runQuestions, workflowEdits } from './flow-run-edits';

const run = flowRunSchema.parse({
  run_id: 'flowrun_e',
  flow: 'workflow',
  status: 'running',
  view: {
    kind: 'workflow',
    steps: [
      { id: 'draft', target: 'self', status: 'completed', handle: 'task_draft' },
      { id: 'check', target: 'critic', after: ['draft'], status: 'pending' },
      { id: 'polish', target: 'self', after: ['draft'], status: 'cancelled' },
    ],
    awaiting_approval: [{ id: 'cite', target: 'self', after: ['check'], by: 'check' }],
    editors: ['critic'],
    approve_edits: true,
  },
  calls: [
    {
      invocation: 'flowrun_e:ask:key=approve:draft:0:check:0123456789abcdef:0',
      kind: 'ask',
      handle: 'task_ask_check',
      status: 'completed',
    },
  ],
  events: [
    { event: 'step_proposed', step: 'check', target: 'critic', after: ['draft'], by: 'draft' },
    { event: 'step_added', step: 'check', target: 'critic', by: 'draft', approved: true },
    { event: 'step_proposed', step: 'skip', target: 'self', by: 'draft' },
    { event: 'step_rejected', step: 'skip', target: 'self', by: 'draft', reason: 'not_approved' },
    { event: 'step_cancelled', step: 'polish', by: 'repair:draft' },
    { event: 'cancel_rejected', step: 'draft', by: 'check', reason: 'not_pending' },
    { event: 'step_proposed', step: 'cite', target: 'self', after: ['check'], by: 'check' },
  ],
});

function question(
  id: string,
  extra: Partial<PendingInteraction> & { payload?: Record<string, unknown> },
): PendingInteraction {
  return {
    id,
    kind: 'question',
    owner_session_id: 'sess_step',
    attended_session_id: 'sess_root',
    status: 'answered',
    title: 'Question',
    source: { protocol: 'native' },
    created_at: '2026-10-27T10:00:00Z',
    ...extra,
  } as PendingInteraction;
}

describe('workflow edits', () => {
  it('reads each proposal to what became of it, in the order the run recorded', () => {
    const edits = workflowEdits(run);
    expect(edits.map((edit) => [edit.step, edit.outcome])).toEqual([
      ['check', 'approved'],
      ['skip', 'declined'],
      ['polish', 'cancelled'],
      ['draft', 'cancel_refused'],
      ['cite', 'awaiting'],
    ]);
    expect(edits.map(editOutcomeText)).toEqual([
      'added after you approved it',
      'not added: you declined it',
      'cancelled before it ran',
      'cancel refused: the step had already started',
      'awaiting your approval',
    ]);
  });

  it("finds the run's questions, the step each is about, and the answer", () => {
    const questions = runQuestions(run, [
      question('question:task_ask_check', {
        task_id: 'task_ask_check',
        prompt: "Add workflow step 'check' (critic) after draft, proposed by draft?",
        payload: {
          options: [{ label: 'Yes', value: 'yes' }],
          selected_options: ['yes'],
          metadata: { flow_run: 'flowrun_e' },
        },
        created_at: '2026-10-27T10:01:00Z',
      }),
      question('question:task_fork', {
        task_id: 'task_fork',
        prompt: "Fork step 'draft' as 'draft~1': Allow?",
        status: 'pending',
        payload: { metadata: { workflow_run: 'flowrun_e', step: 'draft' } },
      }),
      question('question:other', {
        task_id: 'task_other',
        payload: { metadata: { workflow_run: 'flowrun_other', step: 'x' } },
      }),
    ]);
    expect(questions).toEqual([
      expect.objectContaining({ step: 'draft', about: 'fork', status: 'pending', answer: '' }),
      expect.objectContaining({ step: 'check', about: 'step', answer: 'Yes' }),
    ]);
  });
});
