/**
 * GAP 6 — CapabilityFlags admits clio's real mixed-type capabilities map.
 *
 * Live clio (:17803) returns a `capabilities` object that mixes booleans
 * with string flags (x_clio_hook_backend, x_clio_text_streaming) and
 * nested-object flags (x_clio_hook_events, x_clio_stream_fallback_reasons,
 * x_clio_capability_gaps). The loosened index signature must accept that
 * shape, and the newly-typed flags must read back at their declared types.
 *
 * The assignment + property reads below are the test: if the type rejected
 * the real shape, `pnpm typecheck` would fail before the runtime asserts.
 */
import { describe, expect, it } from 'vitest';
import type { CapabilityFlags } from '../src/wire/types.js';

// Verbatim subset of GET /v1/capabilities → capabilities on live :17803.
const LIVE_CAPS: CapabilityFlags = {
  workspaces: true,
  sessions: true,
  subagents: true,
  mcp: true,
  lsp: false,
  hooks: true,
  metrics: true,
  voice: false,
  // string-valued flags
  x_clio_cancellation: 'best_effort',
  x_clio_text_streaming: 'best_effort_live',
  x_clio_hook_backend: 'local_python',
  x_clio_semantic_trace_backend: 'none',
  x_clio_semantic_trace_detail: 'semantic',
  // boolean x_ flags
  x_clio_semantic_events: true,
  x_clio_files_content: true,
  x_clio_retry_attempts: true,
  // nested-object flags
  x_clio_hook_events: {
    pre_tool: 0,
    post_tool: 0,
    pre_message: 1,
    post_message: 0,
    semantic_event: 0,
    on_error: 0,
  },
  x_clio_stream_fallback_reasons: {
    sync_execution_path: {
      category: 'non_streamed_execution',
      synthetic_posthoc: true,
    },
  },
  x_clio_capability_gaps: {
    voice: { status: 'unsupported', advertised: false },
  },
};

describe('CapabilityFlags (GAP 6 — mixed-type map)', () => {
  it('accepts the real :17803 capabilities shape', () => {
    expect(LIVE_CAPS.x_clio_semantic_events).toBe(true);
    expect(LIVE_CAPS.workspaces).toBe(true);
  });

  it('exposes the new flags at their declared types', () => {
    // x_clio_hook_backend is a string flag.
    const backend: string | undefined =
      typeof LIVE_CAPS.x_clio_hook_backend === 'string'
        ? LIVE_CAPS.x_clio_hook_backend
        : undefined;
    expect(backend).toBe('local_python');

    // x_clio_hook_events is a Record<string, number>; pre_message > 0 means
    // a turn can be blocked.
    const hookEvents = LIVE_CAPS.x_clio_hook_events;
    expect(hookEvents?.['pre_message']).toBe(1);

    // x_clio_semantic_events gates the Inspector semantic trace.
    expect(LIVE_CAPS.x_clio_semantic_events).toBe(true);
  });

  it('still types the boolean feature gates as booleans', () => {
    const gate: boolean = LIVE_CAPS.permissions ?? false;
    expect(gate).toBe(false);
    expect(LIVE_CAPS.lsp).toBe(false);
  });
});
