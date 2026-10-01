import { describe, expect, it } from 'vitest';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';
import { messageBlockSchema } from './schemas.js';
import { TransportError, type TransportFrame } from './transport.js';
import type { EntityState, UserQuestion } from './domain.js';
import { mergeVariantRuns, variantRunsFromTrace } from './variant-reducer.js';
import type { VariantSemanticEvent } from './variant-schemas.js';

let cursor = 0;

/** A frame shaped exactly like clio-agent's `event_to_v3` output for a variant row. */
function frame(type: string, payload: unknown, entityId?: string): TransportFrame {
  cursor += 1;
  return {
    cursor: String(cursor),
    eventName: type,
    receivedAt: '2026-10-01T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: '2026-10-01T12:00:00Z',
      scope: {
        connection_id: 'local',
        workspace_id: 'ws_1',
        session_id: 'sess_1',
        run_id: 'turn_1',
      },
      entity_id: entityId,
      entity_revision: cursor,
      payload,
    },
  };
}

const RUN = {
  variants_id: 'var_1',
  session_id: 'sess_1',
  run_id: 'turn_1',
  agent_id: 'main',
  origin: 'draft_alternatives',
  strategy: 'best_of_n',
  judge: 'lm',
  n: 3,
};

function tryFrame(index: number, extra: Record<string, unknown> = {}): TransportFrame {
  const id = `var_1:${index}`;
  return frame(
    'variant.try.upserted',
    { id, ...RUN, try_index: index, scope: `main#run${index}`, state: 'running', ...extra },
    id,
  );
}

function deltaFrame(index: number, delta: string, kind = 'text'): TransportFrame {
  const id = `var_1:${index}`;
  return frame(
    'variant.try.delta',
    { id, variants_id: 'var_1', try_index: index, kind, delta },
    id,
  );
}

function reduce(frames: TransportFrame[], state: EntityState = createEntityState()): EntityState {
  return frames.reduce(reduceTransportFrame, state);
}

describe('variant run reducer', () => {
  it('streams parallel tries into their own tabs, never the turn', () => {
    const state = reduce([
      tryFrame(0),
      tryFrame(1),
      deltaFrame(0, 'Alpha '),
      deltaFrame(1, 'Beta '),
      deltaFrame(1, 'thinks', 'thinking'),
      deltaFrame(0, 'one'),
      deltaFrame(1, 'two'),
    ]);
    const run = state.variant_runs.var_1!;
    expect(run.tries.map((item) => [item.try_index, item.text, item.thinking])).toEqual([
      [0, 'Alpha one', ''],
      [1, 'Beta two', 'thinks'],
    ]);
    expect(run).toMatchObject({ run_id: 'turn_1', strategy: 'best_of_n', judge: 'lm', n: 3 });
    expect(Object.keys(state.messages)).toEqual([]);
  });

  it('keeps the streamed text when a completed try is scored by a later upsert', () => {
    const state = reduce([
      tryFrame(0),
      deltaFrame(0, 'partial'),
      tryFrame(0, {
        state: 'completed',
        text: 'Final draft',
        tokens: { input: 10, output: 4, total: 14 },
      }),
      deltaFrame(0, ' late'),
      tryFrame(0, { state: 'completed', score: 0.75 }),
    ]);
    expect(state.variant_runs.var_1!.tries[0]).toMatchObject({
      state: 'completed',
      text: 'Final draft',
      score: 0.75,
      tokens: { input: 10, output: 4, total: 14 },
    });
  });

  it('records the selection with its scores and the user pick', () => {
    const state = reduce([
      tryFrame(0, { state: 'completed', text: 'A' }),
      tryFrame(1, { state: 'completed', text: 'B' }),
      frame(
        'variant.selected',
        {
          ...RUN,
          judge: 'user',
          selected_index: 1,
          selected_scope: 'main#run1',
          text: 'B',
          scores: [{ try_index: 0, score: 0.2 }],
          pick: 1,
          comment: 'shorter',
        },
        'var_1',
      ),
    ]);
    const run = state.variant_runs.var_1!;
    expect(run.selection).toEqual({
      selected_index: 1,
      selected_scope: 'main#run1',
      text: 'B',
      scores: [{ try_index: 0, score: 0.2 }],
      winning_score: undefined,
      pick: 1,
      comment: 'shorter',
    });
    expect(run.judge).toBe('user');
    expect(run.tries[0]!.score).toBe(0.2);
  });

  it('records a gap for a delta whose try started before this stream', () => {
    const state = reduce([deltaFrame(2, 'orphan')]);
    expect(state.variant_runs).toEqual({});
    expect(state.gaps.at(-1)).toMatchObject({ code: 'entity_not_resident', entity_id: 'var_1:2' });
  });

  it('routes a try-stamped semantic event to the try and ignores unstamped ones', () => {
    const base = reduce([tryFrame(0)]);
    const stamped = reduceTransportFrame(
      base,
      frame('semantic.event', {
        event_type: 'react.step.completed',
        turn_id: 'turn_1',
        status: 'completed',
        summary: 'searched the docs',
        payload: { variants_id: 'var_1', try_index: 0 },
      }),
    );
    expect(stamped.variant_runs.var_1!.tries[0]!.activity).toEqual([
      {
        event_type: 'react.step.completed',
        summary: 'searched the docs',
        status: 'completed',
        occurred_at: undefined,
      },
    ]);
    const plain = reduceTransportFrame(
      stamped,
      frame('semantic.event', { event_type: 'react.step.completed', payload: {} }),
    );
    expect(plain.variant_runs).toBe(stamped.variant_runs);
  });

  it('joins a pick question to its run and seeds tries it never saw run', () => {
    const state = reduce([frame('question.upserted', pickQuestion('q_1', 'pending'), 'q_1')]);
    const run = state.variant_runs.var_1!;
    expect(run).toMatchObject({ agent_id: 'main', origin: 'draft_alternatives', judge: 'user' });
    expect(run.tries.map((item) => [item.try_index, item.scope, item.state, item.text])).toEqual([
      [0, 'main#run0', 'completed', 'First'],
      [1, 'main#run1', 'completed', 'Second'],
    ]);
    expect(run.questions).toMatchObject([{ id: 'q_1', status: 'pending', refinable: true }]);
    expect(state.questions.q_1!.status).toBe('pending');
  });

  it('keeps the variant stamp on an injection block made inside a try', () => {
    expect(
      messageBlockSchema.parse({
        id: 'inj_1',
        type: 'injection',
        source: 'variant_advice',
        text: 'Make it shorter',
        call_id: '',
        variants_id: 'var_1',
        try_index: 2,
      }),
    ).toMatchObject({ type: 'injection', variants_id: 'var_1', try_index: 2 });
  });
});

function pickQuestion(id: string, status: UserQuestion['status']): Record<string, unknown> {
  return {
    id,
    session_id: 'sess_1',
    prompt: 'Which draft should continue the conversation?',
    status,
    kind: 'choice',
    allow_freeform: true,
    options: [
      { label: 'Draft 1', value: 'main#run0', description: 'First' },
      { label: 'Draft 2', value: 'main#run1', description: 'Second' },
    ],
    selected_options: status === 'answered' ? ['main#run1'] : [],
    answer: status === 'answered' ? 'tighter please' : undefined,
    created_at: '2026-10-01T12:00:05Z',
    updated_at: '2026-10-01T12:00:05Z',
    metadata: {
      tool_name: 'draft_alternatives',
      variants_id: 'var_1',
      variant: {
        strategy: 'refine',
        judge: 'user',
        n: 3,
        rubric: 'clear and short',
        refinable: true,
        candidates: [
          { id: 'main#run0', try_index: 0, text: 'First' },
          { id: 'main#run1', try_index: 1, text: 'Second' },
        ],
      },
    },
  };
}

describe('variant runs after a reload', () => {
  const trace: VariantSemanticEvent[] = [
    {
      event_type: 'variant.try',
      turn_id: 'turn_1',
      session_id: 'sess_1',
      status: 'running',
      summary: '',
      payload: {
        ...RUN,
        judge: 'user',
        strategy: 'refine',
        try_index: 0,
        scope: 'main#run0',
        status: 'running',
      },
    },
    {
      event_type: 'variant.try.delta',
      turn_id: 'turn_1',
      status: 'running',
      summary: '',
      payload: { variants_id: 'var_1', try_index: 0, kind: 'text', delta: 'Fir' },
    },
    {
      event_type: 'variant.try',
      turn_id: 'turn_1',
      status: 'completed',
      summary: '',
      payload: {
        ...RUN,
        judge: 'user',
        strategy: 'refine',
        try_index: 0,
        scope: 'main#run0',
        status: 'completed',
        text: 'First',
        tokens: { input: 5, output: 2, total: 7 },
      },
    },
    {
      event_type: 'variant.try',
      turn_id: 'turn_2',
      status: 'completed',
      summary: '',
      payload: {
        ...RUN,
        judge: 'user',
        strategy: 'refine',
        try_index: 2,
        scope: 'main#run2',
        status: 'completed',
        text: 'Refined',
        forked_from: 1,
        advice: 'tighter please',
      },
    },
  ];

  it('rebuilds tries, advice and the questions from the durable trace', () => {
    const questions = [pickQuestion('q_1', 'answered')].map(
      (question) => question as unknown as UserQuestion,
    );
    const runs = variantRunsFromTrace(trace, questions, 'sess_1');
    const run = runs.var_1!;
    expect(run.run_id).toBe('turn_1');
    expect(run.tries.map((item) => [item.try_index, item.text, item.advice])).toEqual([
      [0, 'First', undefined],
      [1, 'Second', undefined],
      [2, 'Refined', 'tighter please'],
    ]);
    expect(run.tries[0]!.tokens).toEqual({ input: 5, output: 2, total: 7 });
    expect(run.questions[0]).toMatchObject({ status: 'answered', answer: 'tighter please' });
  });

  it('lets the live stream win while the trace fills what it never saw', () => {
    const live = reduce([
      frame(
        'variant.try.upserted',
        {
          id: 'var_1:2',
          ...RUN,
          run_id: 'turn_2',
          try_index: 2,
          scope: 'main#run2',
          state: 'running',
        },
        'var_1:2',
      ),
      deltaFrame(2, 'Refined live'),
    ]).variant_runs;
    const persisted = variantRunsFromTrace(trace.slice(0, 3), [], 'sess_1');
    const merged = mergeVariantRuns(live, persisted).var_1!;
    expect(merged.run_id).toBe('turn_1');
    expect(merged.tries.map((item) => [item.try_index, item.state, item.text])).toEqual([
      [0, 'completed', 'First'],
      [2, 'running', 'Refined live'],
    ]);
  });

  it('reads the variant trace and reports a deployment without one as unavailable', async () => {
    const transport = new RecordingTransport([
      { events: trace },
      new TransportError('ARC memory is not enabled for this deployment', 503, 'arc_unavailable'),
    ]);
    const repository = new ClioRepository(transport);
    await expect(repository.variantTrace('sess 1')).resolves.toMatchObject({
      status: 'available',
      events: { length: 4 },
    });
    await expect(repository.variantTrace('sess 1')).resolves.toEqual({
      status: 'unavailable',
      reason: 'ARC memory is not enabled for this deployment',
    });
    expect(transport.requests[0]!.path).toBe(
      '/v1/sessions/sess%201/trace?scope=variant&limit=2000',
    );
  });
});
