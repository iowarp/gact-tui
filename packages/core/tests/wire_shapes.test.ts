/**
 * Wire-shape conformance for the payloads that had drifted from the actual
 * server (iowarp/gact-tui#232). Every payload literal below is copied from
 * what clio-agent actually emits (src/clio_agent/gact/ — types.py,
 * routes/sessions.py, turn.py, permission_gate.py). The `satisfies` checks
 * make `pnpm -C core typecheck` fail if the wire layer drifts again.
 */
import { describe, expect, it } from 'vitest';
import { applyPartCompleted } from '../src/store/transcript.js';
import type {
  MessagePartCompletedPayload,
  PermissionResolvedPayload,
  SessionCompactedPayload,
  SessionUpdatedPayload,
} from '../src/wire/events.js';
import type { Message, SessionStatus } from '../src/wire/types.js';

describe('wire shapes match the clio server (#232)', () => {
  it('SessionStatus covers the full clio literal set', () => {
    // clio types.py Session.status: idle | running | waiting_permission |
    // waiting_user | error | cancelled.
    const statuses = [
      'idle',
      'running',
      'waiting_permission',
      'waiting_user',
      'error',
      'cancelled',
    ] satisfies SessionStatus[];
    expect(statuses).toHaveLength(6);
  });

  it('session.updated payload is the full flat Session, not a diff', () => {
    // clio routes/sessions.py:175-178 publishes
    // payload=Session(**sess.to_wire()).model_dump(exclude_none=True).
    const payload = {
      id: 'ses_1',
      workspace_id: 'ws_default',
      title: 'fix the wire',
      status: 'running',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:01Z',
      message_count: 3,
      routing_mode: 'experts',
      edit_mode: 'patch',
      metadata: {},
    } satisfies SessionUpdatedPayload;
    expect(payload.id).toBe('ses_1');
  });

  it('permission.resolved action uses the allow/deny vocabulary', () => {
    // clio permission_gate.py: action ∈ allow | deny | allow_session |
    // allow_workspace ('approve' was never on the wire).
    const actions = ['allow', 'deny', 'allow_session', 'allow_workspace'] satisfies
      PermissionResolvedPayload['action'][];
    expect(actions).toHaveLength(4);
  });

  it('session.compacted payload carries the server keys', () => {
    // clio routes/sessions.py:850-858.
    const payload = {
      event_id: 'mem_evt_1',
      archived_count: 12,
      summary_chars: 480,
      summary_message_id: 'msg_compact_1',
      version: 1,
    } satisfies SessionCompactedPayload;
    expect(payload.archived_count).toBe(12);
  });

  it('message.part.completed carries final_text/turn_id/stream_source', () => {
    // clio turn.py:827-839. The transcript store DEPENDS on final_text for
    // batch providers that emit no part.delta chunks.
    const payload = {
      turn_id: 'msg_user_1',
      message_id: 'm1',
      part_id: 'p1',
      stream_source: 'live',
      final_text: 'the whole answer at once',
    } satisfies MessagePartCompletedPayload;

    const shell: Message = {
      id: 'm1',
      role: 'assistant',
      parts: [{ id: 'p1', type: 'text', text: '' }],
    };
    const out = applyPartCompleted([shell], payload.message_id, payload.part_id, payload.final_text);
    expect((out[0]!.parts[0] as { text: string }).text).toBe('the whole answer at once');
  });
});
