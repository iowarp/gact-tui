import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import { decodeEventEnvelope } from './schemas.js';
import type { TransportFrame } from './transport.js';

const goldenCaptureSchema = z.object({
  metadata: z.object({
    producer: z.string(),
    backend_sha: z.string(),
    protocol_version: z.string(),
    a2ui_protocol_version: z.string(),
    generated_at: z.string(),
  }),
  frames: z.array(
    z.object({
      cursor: z.string(),
      eventName: z.string(),
      receivedAt: z.string(),
      data: z.unknown(),
    }),
  ),
});

interface GoldenCapture {
  metadata: z.infer<typeof goldenCaptureSchema>['metadata'];
  frames: TransportFrame[];
}

function loadGoldenCapture(): GoldenCapture {
  const capture = goldenCaptureSchema.parse(
    JSON.parse(
      readFileSync(new URL('./fixtures/backend-golden-frames.json', import.meta.url), 'utf8'),
    ),
  );

  return {
    metadata: capture.metadata,
    frames: capture.frames.map((frame) => ({
      cursor: frame.cursor,
      eventName: frame.eventName,
      receivedAt: frame.receivedAt,
      data: frame.data,
    })),
  };
}

describe('clio-agent GACT 0.3 golden frames', () => {
  it('decodes and reduces the backend-produced causal sequence', () => {
    const capture = loadGoldenCapture();
    expect(capture.metadata).toMatchObject({
      producer: 'clio_agent.gact.protocol.v3.event.event_to_v3',
      protocol_version: '0.3',
      a2ui_protocol_version: '0.9.1',
    });
    expect(capture.metadata.backend_sha).toMatch(/^[0-9a-f]{40}$/u);

    for (const frame of capture.frames) {
      expect(decodeEventEnvelope(frame.data).type).toBe(frame.eventName);
    }

    const state = capture.frames.reduce(reduceTransportFrame, createEntityState());

    expect(state.stream).toBe('live');
    expect(state.cursor).toBe('112');
    expect(state.messages.msg_golden).toMatchObject({
      completed_at: '2026-08-27T15:00:00+00:00',
      stop_reason: 'end_turn',
      usage: { input: 120, output: 45, cache_read: 30, cache_write: 0 },
      cost_usd: 0.0125,
      blocks: [
        {
          id: 'reasoning_golden',
          type: 'reasoning',
          text: 'Inspecting station catalog.',
          provider_source: 'claude',
          streaming: false,
        },
        {
          id: 'text_golden',
          type: 'text',
          text: 'Found 72 stations.',
          channel: 'answer',
          streaming: false,
        },
      ],
    });
    expect(state.tools.tool_golden).toMatchObject({
      title: 'Filter stations by radius',
      state: 'succeeded',
      output: { within_radius_count: 72 },
    });
    expect(state.subagents.task_golden).toMatchObject({
      child_session_id: 'sess_child_golden',
      state: 'running',
    });
    expect(state.surfaces.surface_golden).toMatchObject({
      state: 'ready',
      protocol_version: '0.9.1',
      revision: 2,
    });
  });
});
