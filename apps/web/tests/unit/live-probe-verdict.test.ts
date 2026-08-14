/**
 * Synthetic-fixture unit tests for the live-probe verdict reducer
 * (gact-tui#364 in-flight tool rendering / #362 thinking dropout). Written
 * FIRST, before `live-probe.mjs` exists — every fixture here is HAND-BUILT
 * evidence shaped like the four JSONL streams the driver will eventually
 * produce, never captured from a live run. One case per verdict class, plus
 * the two structural cases the issue calls out explicitly: server-side
 * duplicate frames (two EventSource connections) must dedupe, and a
 * client-observed event with no server counterpart must be REPORTED, never
 * silently dropped.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  VERDICT_CLASSES,
  classifyToolCall,
  computeVerdict,
  dedupeServerFrames,
  matchDomRowsToCalls,
} from '../../scripts/probe/verdict.mjs';

const FIXED_NOW = '2026-08-14T00:00:00.000Z';

function serverRow(overrides: Record<string, unknown>) {
  return {
    event_id: 'evt_1',
    event_type: 'message.part.added',
    occurred_at: '2026-08-14T00:00:00.000Z',
    sse_written_at: '2026-08-14T00:00:00.010Z',
    replay: false,
    part_id: 'live_call_1_call',
    part_type: 'tool_call',
    call_id: 'call_1',
    tool_name: 'wait_agent_tasks',
    message_id: 'asst_1',
    ...overrides,
  };
}

function clientRow(overrides: Record<string, unknown>) {
  return {
    recv_at: '2026-08-14T00:00:00.020Z',
    type: 'message.part.added',
    lastEventId: 'evt_1',
    part_id: 'live_call_1_call',
    part_type: 'tool_call',
    call_id: 'call_1',
    tool_name: 'wait_agent_tasks',
    ...overrides,
  };
}

function domRow(overrides: Record<string, unknown>) {
  return {
    t: '2026-08-14T00:00:00.030Z',
    op: 'add',
    testid: 'part-tool',
    kind: 'tool',
    pending: true,
    textHead: 'wait_agent_tasks (task_a, task_b)',
    ...overrides,
  };
}

describe('classifyToolCall', () => {
  it('exposes exactly the four verdict classes named in issue #364', () => {
    expect(VERDICT_CLASSES).toEqual(['server-late', 'transport-lost', 'render-late', 'not-reproduced']);
  });

  it('server-late: no t_published observed at all, but a result did land', () => {
    const verdict = classifyToolCall({ t_published: undefined, t_received: undefined, t_dom: undefined, t_result: 5000 });
    expect(verdict).toBe('server-late');
  });

  it('server-late: t_published exists but sits within minServerWindowMs of t_result (no real started window)', () => {
    const verdict = classifyToolCall({ t_published: 1000, t_received: 1010, t_dom: 1020, t_result: 1100 });
    expect(verdict).toBe('server-late');
  });

  it('transport-lost: server published in good time, browser EventSource never received it', () => {
    const verdict = classifyToolCall({ t_published: 1000, t_received: undefined, t_dom: undefined, t_result: 5000 });
    expect(verdict).toBe('transport-lost');
  });

  it('render-late: server + client both saw it in time, but the DOM never showed a distinct row before the result', () => {
    const verdict = classifyToolCall({ t_published: 1000, t_received: 1050, t_dom: undefined, t_result: 5000 });
    expect(verdict).toBe('render-late');
  });

  it('render-late: DOM row appeared, but only within minVisibleGapMs of the result (coincident, not "in flight")', () => {
    const verdict = classifyToolCall({ t_published: 1000, t_received: 1050, t_dom: 4900, t_result: 5000 });
    expect(verdict).toBe('render-late');
  });

  it('not-reproduced: DOM showed a distinct in-flight row well before the result landed', () => {
    const verdict = classifyToolCall({ t_published: 1000, t_received: 1050, t_dom: 1100, t_result: 5000 });
    expect(verdict).toBe('not-reproduced');
  });

  it('not-reproduced: the DOM row is showing and the tool has not completed yet (t_result absent)', () => {
    const verdict = classifyToolCall({ t_published: 1000, t_received: 1050, t_dom: 1100, t_result: undefined });
    expect(verdict).toBe('not-reproduced');
  });

  it('thresholds are overridable per call, never hardcoded past the caller', () => {
    const tight = { ...DEFAULT_THRESHOLDS, minVisibleGapMs: 10 };
    // Only a 40ms gap — would be render-late under the default 250ms bar,
    // but clears a caller-supplied 10ms bar.
    const verdict = classifyToolCall({ t_published: 1000, t_received: 1050, t_dom: 4960, t_result: 5000 }, tight);
    expect(verdict).toBe('not-reproduced');
  });

  it('throws rather than silently guessing when a caller passes zero evidence', () => {
    expect(() =>
      classifyToolCall({ t_published: undefined, t_received: undefined, t_dom: undefined, t_result: undefined }),
    ).toThrow(/no evidence/);
  });
});

describe('dedupeServerFrames', () => {
  it('collapses two connections publishing the same event_id, keeping the earliest sse_written_at', () => {
    const rows = [
      serverRow({ sse_written_at: '2026-08-14T00:00:00.500Z' }), // connection B, later write
      serverRow({ sse_written_at: '2026-08-14T00:00:00.100Z' }), // connection A, earlier write
    ];
    const deduped = dedupeServerFrames(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.sse_written_at).toBe('2026-08-14T00:00:00.100Z');
  });

  it('never drops a row with no event_id (unjoinable, but still evidence)', () => {
    const rows = [serverRow({ event_id: undefined }), serverRow({ event_id: undefined })];
    expect(dedupeServerFrames(rows)).toHaveLength(2);
  });

  it('leaves distinct event ids alone', () => {
    const rows = [serverRow({ event_id: 'evt_1' }), serverRow({ event_id: 'evt_2' })];
    expect(dedupeServerFrames(rows)).toHaveLength(2);
  });
});

describe('matchDomRowsToCalls', () => {
  it('prefers a textHead match over plain position when both are available', () => {
    const calls = [
      { part_id: 'p1', tool_name: 'check_agent_tasks' },
      { part_id: 'p2', tool_name: 'wait_agent_tasks' },
    ];
    const rows = [
      { t: 1, textHead: 'wait_agent_tasks (x)' },
      { t: 2, textHead: 'check_agent_tasks (y)' },
    ];
    const matches = matchDomRowsToCalls(calls, rows);
    expect(matches.get('p1')).toEqual(rows[1]);
    expect(matches.get('p2')).toEqual(rows[0]);
  });

  it('falls back to positional order when no text match is available', () => {
    const calls = [
      { part_id: 'p1', tool_name: 'jarvis_add_step' },
      { part_id: 'p2', tool_name: 'jarvis_add_step' },
    ];
    const rows = [
      { t: 1, textHead: 'jarvis_add_step ("a")' },
      { t: 2, textHead: 'jarvis_add_step ("b")' },
    ];
    const matches = matchDomRowsToCalls(calls, rows);
    expect(matches.get('p1')).toEqual(rows[0]);
    expect(matches.get('p2')).toEqual(rows[1]);
  });

  it('maps to undefined — never a fabricated match — when no DOM row is left', () => {
    const calls = [
      { part_id: 'p1', tool_name: 'wait_agent_tasks' },
      { part_id: 'p2', tool_name: 'wait_agent_tasks' },
    ];
    const rows = [{ t: 1, textHead: 'wait_agent_tasks (x)' }];
    const matches = matchDomRowsToCalls(calls, rows);
    expect(matches.get('p2')).toBeUndefined();
  });

  // Opus adversarial review, fix #7 (W1/U1 coherence): ToolPart.tsx now
  // stamps data-call-id (gact-tui#364 client half), so the DOM row's own
  // callId is the PRIMARY join key — an exact match wins even when the
  // text/positional heuristic would have picked a DIFFERENT row.
  it('prefers an EXACT call_id match over the text heuristic, even when text would pick a different row', () => {
    const calls = [
      { part_id: 'p1', tool_name: 'jarvis_add_step', call_id: 'call_2' },
      { part_id: 'p2', tool_name: 'jarvis_add_step', call_id: 'call_1' },
    ];
    // Rows are in the OPPOSITE order from the calls' own call_id — a pure
    // text/positional heuristic (identical tool_name on both) would pair
    // p1->rows[0] and p2->rows[1]; the id join must invert that.
    const rows = [
      { t: 1, textHead: 'jarvis_add_step ("a")', callId: 'call_1' },
      { t: 2, textHead: 'jarvis_add_step ("b")', callId: 'call_2' },
    ];
    const matches = matchDomRowsToCalls(calls, rows);
    expect(matches.get('p1')).toEqual(rows[1]);
    expect(matches.get('p2')).toEqual(rows[0]);
  });

  it('falls back to the text/positional heuristic when the DOM row carries no callId at all (an older capture)', () => {
    const calls = [
      { part_id: 'p1', tool_name: 'check_agent_tasks', call_id: 'call_1' },
      { part_id: 'p2', tool_name: 'wait_agent_tasks', call_id: 'call_2' },
    ];
    const rows = [
      { t: 1, textHead: 'wait_agent_tasks (x)' },
      { t: 2, textHead: 'check_agent_tasks (y)' },
    ];
    const matches = matchDomRowsToCalls(calls, rows);
    expect(matches.get('p1')).toEqual(rows[1]);
    expect(matches.get('p2')).toEqual(rows[0]);
  });

  it('falls back to the text/positional heuristic when the row callId matches no known call', () => {
    const calls = [{ part_id: 'p1', tool_name: 'geo_geocode', call_id: 'call_real' }];
    const rows = [{ t: 1, textHead: 'geo_geocode ("LA")', callId: 'call_unrelated' }];
    const matches = matchDomRowsToCalls(calls, rows);
    expect(matches.get('p1')).toEqual(rows[0]);
  });
});

describe('computeVerdict', () => {
  it('produces a not-reproduced call end-to-end from four clean, joined streams', () => {
    const verdict = computeVerdict(
      {
        serverRows: [serverRow({})],
        clientRows: [clientRow({})],
        domRows: [domRow({})],
        auditRows: [],
      },
      { now: () => FIXED_NOW },
    );
    expect(verdict.generated_at).toBe(FIXED_NOW);
    expect(verdict.calls).toHaveLength(1);
    expect(verdict.calls[0]).toMatchObject({
      part_id: 'live_call_1_call',
      tool_name: 'wait_agent_tasks',
      verdict: 'not-reproduced',
    });
    expect(verdict.server_ids_absent_client_side).toEqual([]);
    expect(verdict.unexplained_client_events).toEqual([]);
  });

  it('dedupes the two-EventSource server duplicate before joining, without double-counting the call', () => {
    const verdict = computeVerdict({
      serverRows: [
        serverRow({ sse_written_at: '2026-08-14T00:00:00.010Z' }),
        serverRow({ sse_written_at: '2026-08-14T00:00:00.400Z' }), // duplicate from the 2nd EventSource
      ],
      clientRows: [clientRow({})],
      domRows: [domRow({})],
    });
    expect(verdict.calls).toHaveLength(1);
    expect(verdict.counts.server_frames_raw).toBe(2);
    expect(verdict.counts.server_frames_deduped).toBe(1);
  });

  it('lists a server event id explicitly when no client-sse record ever matched it (transport-lost evidence)', () => {
    const verdict = computeVerdict({
      serverRows: [serverRow({ event_id: 'evt_lost' })],
      clientRows: [],
      domRows: [],
    });
    expect(verdict.calls[0]!.verdict).toBe('transport-lost');
    expect(verdict.server_ids_absent_client_side).toEqual(['evt_lost']);
  });

  it('reports an unexplained client event with no server counterpart — never silently drops it', () => {
    const verdict = computeVerdict({
      serverRows: [serverRow({})],
      clientRows: [clientRow({}), clientRow({ lastEventId: 'evt_mystery', part_id: 'live_call_9_call', call_id: 'call_9' })],
      domRows: [domRow({})],
    });
    expect(verdict.unexplained_client_events).toHaveLength(1);
    expect(verdict.unexplained_client_events[0]).toMatchObject({ lastEventId: 'evt_mystery' });
    // The explained call is still classified normally alongside it.
    expect(verdict.calls.find((c) => c.part_id === 'live_call_1_call')?.verdict).toBe('not-reproduced');
  });

  it('a collector re-poll chain (stable part_id, changing call_id) resolves t_result off the FINAL call_id', () => {
    // wait_agent_tasks re-polled once: attempt 1 published+updated, THEN a
    // second message.part.updated collapses onto the SAME part_id with a
    // fresh call_id (transcript.py::upsert_repeated_collector_call), and
    // only the second attempt's tool_result actually lands.
    const verdict = computeVerdict({
      serverRows: [
        serverRow({
          event_id: 'evt_a1',
          event_type: 'message.part.added',
          occurred_at: '2026-08-14T00:00:00.000Z',
          part_id: 'live_call_1_call',
          call_id: 'call_1',
        }),
        serverRow({
          event_id: 'evt_a2',
          event_type: 'message.part.updated',
          occurred_at: '2026-08-14T00:00:01.000Z',
          part_id: 'live_call_1_call', // stable id — the collapse rewrites id, not part_id's identity
          call_id: 'call_2', // fresh call_id per re-poll
        }),
        serverRow({
          event_id: 'evt_r2',
          event_type: 'message.part.added',
          occurred_at: '2026-08-14T00:00:01.500Z',
          part_id: 'live_call_2_result',
          part_type: 'tool_result',
          call_id: 'call_2',
        }),
      ],
      clientRows: [
        clientRow({ lastEventId: 'evt_a1', part_id: 'live_call_1_call', call_id: 'call_1', recv_at: '2026-08-14T00:00:00.010Z' }),
        clientRow({ lastEventId: 'evt_a2', part_id: 'live_call_1_call', call_id: 'call_2', recv_at: '2026-08-14T00:00:01.010Z' }),
      ],
      domRows: [domRow({ t: '2026-08-14T00:00:00.100Z' })],
    });
    expect(verdict.calls).toHaveLength(1);
    const call = verdict.calls[0]!;
    expect(call.attempts).toBe(2);
    expect(call.call_id).toBe('call_2');
    // t_published is the FIRST attempt's start; t_result is the SECOND
    // (final) attempt's result — the whole re-poll chain is one activity.
    expect(call.t_result).toBeGreaterThan(call.t_published as number);
    expect(call.verdict).toBe('not-reproduced');
  });
});
