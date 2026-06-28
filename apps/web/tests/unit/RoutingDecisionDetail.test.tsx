import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import { shouldRenderPart } from '../../src/components/TranscriptParts.js';
import type { Part } from '@clio/core';

afterEach(cleanup);

/**
 * v0.2 routing detail (capabilities.agent_routing): clio ships `confidence`,
 * `heuristic`, and `execution_path` on routing_decision parts; the web must
 * surface them (TUI parity, render_part_workflow.go). These guard the
 * confidence indicator, the heuristic-vs-LM label, and the execution-path chip,
 * plus that the routing decision survives summary density.
 */
describe('routing decision detail', () => {
  function renderRouting(part: Record<string, unknown>) {
    const routingPart = {
      type: 'routing_decision',
      selected_agent: 'coder',
      rationale: 'matched edit-file intent',
      heuristic: false,
      ...part,
    } as unknown as Part;
    render(() => (
      <Transcript
        density="normal"
        messages={[{ id: 'm-route', role: 'assistant', parts: [routingPart] }]}
      />
    ));
  }

  it('renders the confidence percentage and a LM-routed label', () => {
    renderRouting({ confidence: 0.82, heuristic: false, execution_path: 'expert_loop' });
    const meta = screen.getByTestId('routing-meta');
    expect(within(meta).getByTestId('routing-routedby').textContent).toBe('LM-routed');
    expect(within(meta).getByTestId('routing-confidence').textContent).toContain('82%');
    expect(within(meta).getByTestId('routing-execpath').textContent).toBe('expert loop');
  });

  it('labels a heuristic route and the fast execution path', () => {
    renderRouting({ confidence: 1, heuristic: true, execution_path: 'fast' });
    const meta = screen.getByTestId('routing-meta');
    expect(within(meta).getByTestId('routing-routedby').textContent).toBe('heuristic');
    expect(within(meta).getByTestId('routing-confidence').textContent).toContain('100%');
    expect(within(meta).getByTestId('routing-execpath').textContent).toBe('fast path');
  });

  it('omits the confidence bar and exec-path chip when absent', () => {
    renderRouting({ heuristic: false });
    expect(screen.queryByTestId('routing-confidence')).toBeNull();
    expect(screen.queryByTestId('routing-execpath')).toBeNull();
    // the routed-by label is always present.
    expect(screen.getByTestId('routing-routedby').textContent).toBe('LM-routed');
  });

  it('keeps the routing decision visible in summary density', () => {
    const part = { type: 'routing_decision', selected_agent: 'coder', heuristic: true } as Part;
    expect(shouldRenderPart(part, 'summary')).toBe(true);
  });
});
