import { describe, expect, it } from 'vitest';
import {
  A2UI_VERSION,
  a2uiSurfaceSchema,
  messageSchema,
  runStateSchema,
  toolInvocationSchema,
} from './index.js';

describe('forward-compatible wire enums', () => {
  it('maps future enum values to an explicit unknown state', () => {
    expect(runStateSchema.parse('paused_by_provider')).toBe('unknown');
    expect(
      messageSchema.parse({
        id: 'msg_1',
        session_id: 'sess_1',
        role: 'delegate',
        created_at: '2026-08-27T12:00:00Z',
        blocks: [],
      }).role,
    ).toBe('unknown');
    expect(
      toolInvocationSchema.parse({
        id: 'tool_1',
        session_id: 'sess_1',
        name: 'future_tool',
        state: 'paused',
      }).state,
    ).toBe('unknown');
    expect(
      a2uiSurfaceSchema.parse({
        id: 'surface_1',
        session_id: 'sess_1',
        catalog_id: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
        protocol_version: A2UI_VERSION,
        revision: 1,
        state: 'superseded',
        messages: [],
      }).state,
    ).toBe('unknown');
  });
});
