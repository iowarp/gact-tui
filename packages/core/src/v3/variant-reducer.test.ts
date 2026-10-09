import { describe, expect, it } from 'vitest';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';
import { messageBlockSchema } from './schemas.js';
import { TransportError, type TransportFrame } from './transport.js';
import type { EntityState } from './domain.js';
import { mergeVariantRuns, variantRunsFromRecords } from './variant-reducer.js';
import { variantRunRecordSchema } from './variant-schemas.js';

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

  it('keeps live evaluation criteria when older score frames omit them', () => {
    const state = reduce([
      tryFrame(0, { rubric: 'One concise poem.' }),
      tryFrame(0, { state: 'completed', score: 0.9 }),
    ]);
    expect(state.variant_runs.var_1!.rubric).toBe('One concise poem.');
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

  it('closes a run superseded by the next message, keeping the offered drafts', () => {
    const state = reduce([
      tryFrame(0, { judge: 'user', state: 'completed', text: 'A' }),
      tryFrame(1, { judge: 'user', state: 'completed' }),
      frame(
        'variant.closed',
        {
          ...RUN,
          judge: 'user',
          status: 'superseded',
          reason: 'variant_pick_superseded',
          question_id: 'q_1',
          closed_at: '2026-10-01T12:05:00Z',
          candidates: [
            { try_index: 0, scope: 'main#run0', text: 'A' },
            { try_index: 1, scope: 'main#run1', text: 'B' },
            { try_index: 2, scope: 'main#run2', text: 'C' },
          ],
          superseded_by_message_id: 'msg_user_2',
        },
        'var_1',
      ),
    ]);
    const run = state.variant_runs.var_1!;
    expect(run.status).toBe('superseded');
    expect(run.selection).toBeUndefined();
    expect(run.closure).toEqual({
      status: 'superseded',
      reason: 'variant_pick_superseded',
      closed_at: '2026-10-01T12:05:00Z',
      question_id: 'q_1',
      superseded_by_message_id: 'msg_user_2',
    });
    // A try this client never saw streaming is added from the offered drafts.
    expect(run.tries.map((item) => [item.try_index, item.state, item.text, item.scope])).toEqual([
      [0, 'completed', 'A', 'main#run0'],
      [1, 'completed', 'B', 'main#run1'],
      [2, 'completed', 'C', 'main#run2'],
    ]);
  });

  it('closes a cancelled or expired run with no superseding message', () => {
    for (const status of ['cancelled', 'expired'] as const) {
      const state = reduce([
        frame(
          'variant.closed',
          {
            ...RUN,
            judge: 'user',
            status,
            reason: `variant_pick_${status}`,
            question_id: 'q_1',
            closed_at: '2026-10-01T12:05:00Z',
            candidates: [{ try_index: 0, scope: 'main#run0', text: 'A' }],
          },
          'var_1',
        ),
      ]);
      const run = state.variant_runs.var_1!;
      expect(run.status).toBe(status);
      expect(run.closure).toMatchObject({ status, reason: `variant_pick_${status}` });
      expect(run.closure!.superseded_by_message_id).toBeUndefined();
      expect(run.tries).toHaveLength(1);
    }
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

/** One run exactly as `GET /v1/sessions/{sid}/variant-runs` serves it. */
function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'clio.variant_run.v1',
    variants_id: 'var_1',
    session_id: 'sess_1',
    agent_id: 'main',
    origin: 'draft_alternatives',
    strategy: 'refine',
    judge: 'user',
    n: 3,
    n_requested: 3,
    rubric: 'clear and short',
    threshold: null,
    status: 'selected',
    turn_id: 'msg_user_1',
    anchor_message_id: 'msg_assistant_1',
    question_id: 'q_2',
    pick: 2,
    comment: '',
    selected_index: 2,
    tries: [
      {
        try_index: 0,
        scope: 'main#run0',
        state: 'completed',
        text: 'First',
        score: null,
        tokens: { input: 5, output: 2, total: 7 },
        advice: '',
        forked_from: null,
        error: '',
        turn_id: 'msg_user_1',
        anchor_message_id: 'msg_assistant_1',
        steps: [
          {
            role: 'assistant',
            parts: [
              { type: 'thinking', text: 'Check the mesh.' },
              { type: 'tool_call', id: 'c1', name: 'read_file', input: { path: 'mesh.log' } },
            ],
          },
          {
            role: 'tool',
            parts: [
              {
                type: 'tool_result',
                id: 'c1',
                name: 'read_file',
                is_error: false,
                content: [{ type: 'text', text: 'cells=2.1M' }, { type: 'hologram' }],
              },
            ],
          },
        ],
      },
      {
        try_index: 2,
        scope: 'main#run2',
        state: 'completed',
        text: 'Refined',
        score: null,
        tokens: { input: 9, output: 3, total: 12 },
        advice: 'tighter please',
        forked_from: 0,
        error: '',
        turn_id: 'msg_user_2',
        anchor_message_id: 'msg_assistant_2',
        steps: [],
      },
    ],
    ...overrides,
  };
}

describe('variant runs after a reload', () => {
  it('reads the served runs with their steps and selection', async () => {
    const transport = new RecordingTransport([{ session_id: 'sess 1', runs: [record()] }]);
    const runs = await new ClioRepository(transport).variantRuns('sess 1');
    expect(transport.requests[0]!.path).toBe('/v1/sessions/sess%201/variant-runs');
    const run = runs.var_1!;
    expect(run).toMatchObject({
      run_id: 'msg_user_1',
      anchor_message_id: 'msg_assistant_1',
      status: 'selected',
      rubric: 'clear and short',
      selection: { selected_index: 2, selected_scope: 'main#run2', text: 'Refined', pick: 2 },
    });
    expect(run.tries.map((item) => [item.try_index, item.advice, item.forked_from])).toEqual([
      [0, undefined, undefined],
      [2, 'tighter please', 0],
    ]);
    expect(run.tries[0]!.steps[1]!.parts[0]).toEqual({
      type: 'tool_result',
      id: 'c1',
      name: 'read_file',
      is_error: false,
      content: [
        { type: 'text', text: 'cells=2.1M' },
        { type: 'unknown', original_type: 'hologram' },
      ],
    });
  });

  it('reads a closed run as closed, with its reason and superseding message', () => {
    const runs = variantRunsFromRecords([
      variantRunRecordSchema.parse(
        record({
          status: 'superseded',
          selected_index: null,
          pick: null,
          comment: null,
          question_id: 'q_1',
          closed_reason: 'variant_pick_superseded',
          closed_at: '2026-10-01T12:05:00Z',
          superseded_by_message_id: 'msg_user_3',
        }),
      ),
    ]);
    expect(runs.var_1).toMatchObject({
      status: 'superseded',
      closure: {
        status: 'superseded',
        reason: 'variant_pick_superseded',
        closed_at: '2026-10-01T12:05:00Z',
        question_id: 'q_1',
        superseded_by_message_id: 'msg_user_3',
      },
    });
    expect(runs.var_1!.selection).toBeUndefined();

    const open = variantRunsFromRecords([
      variantRunRecordSchema.parse(
        record({ status: 'awaiting_pick', selected_index: null, pick: null, comment: null }),
      ),
    ]);
    expect(open.var_1!.closure).toBeUndefined();
  });

  it('keeps a live closure when the served record still waits for the pick', () => {
    const live = reduce([
      frame(
        'variant.closed',
        {
          ...RUN,
          judge: 'user',
          status: 'expired',
          reason: 'variant_pick_expired',
          question_id: 'q_1',
          closed_at: '2026-10-01T12:05:00Z',
          candidates: [],
        },
        'var_1',
      ),
    ]).variant_runs;
    const persisted = variantRunsFromRecords([
      variantRunRecordSchema.parse(
        record({ status: 'awaiting_pick', selected_index: null, pick: null, comment: null }),
      ),
    ]);
    const merged = mergeVariantRuns(live, persisted).var_1!;
    expect(merged.status).toBe('expired');
    expect(merged.closure).toMatchObject({ status: 'expired' });
  });

  it('rejects a typed server failure instead of an empty list', async () => {
    const transport = new RecordingTransport([
      new TransportError('variant record seg_9 is unreadable', 500, 'variant_record_unreadable'),
    ]);
    await expect(new ClioRepository(transport).variantRuns('sess_1')).rejects.toMatchObject({
      status: 500,
      code: 'variant_record_unreadable',
    });
  });

  it('lets the live stream win while the record fills what it never saw', () => {
    const live = reduce([
      frame(
        'variant.try.upserted',
        {
          id: 'var_1:2',
          ...RUN,
          run_id: 'msg_user_2',
          try_index: 2,
          scope: 'main#run2',
          state: 'running',
        },
        'var_1:2',
      ),
      deltaFrame(2, 'Refined live'),
    ]).variant_runs;
    const persisted = variantRunsFromRecords([
      variantRunRecordSchema.parse(
        record({ status: 'running', selected_index: null, pick: null, comment: null }),
      ),
    ]);
    const merged = mergeVariantRuns(live, persisted).var_1!;
    expect(merged).toMatchObject({ run_id: 'msg_user_1', anchor_message_id: 'msg_assistant_1' });
    expect(merged.tries.map((item) => [item.try_index, item.state, item.text])).toEqual([
      [0, 'completed', 'First'],
      [2, 'running', 'Refined live'],
    ]);
    expect(merged.tries[0]!.steps).toHaveLength(2);
  });
});
