/**
 * Slice E-live failing-first contract, part 1 — the shapes CAPTURED from a
 * real async run (sess_c74d27bb3cfb, 2026-08-04, codex bridge default;
 * scratchpad capture5-messages-turn1.json):
 *
 *   expert_handoff{stage: "delegate.started", parent_agent, child_agent,
 *     handle_id, run_label: "geospatial #1", live_state: "running", host,
 *     placement, status: "running"}
 *
 * The prototype's child cards (E5) and the waiting line (E8) render from
 * exactly these fields. Completed-card grammar and artifact chips are
 * contracted after the continuation capture lands them.
 */
import { render, screen } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { Transcript } from '../../src/transcript/Transcript';

function msg(id: string, role: Message['role'], parts: unknown[]): Message {
  return { id, role, parts: parts as Message['parts'] };
}

const STARTED_HANDOFF = {
  type: 'expert_handoff',
  id: 'live_handoff_cc313c90a8c5',
  agent_id: 'main',
  text: 'main -> geospatial',
  parent_agent: 'main',
  child_agent: 'geospatial',
  stage: 'delegate.started',
  handle_id: 'task_8562bd68e4d5',
  run_label: 'geospatial #1',
  live_state: 'running',
  host: 'local',
  placement: 'local',
  status: 'running',
};

describe('running child card (E5, captured shape)', () => {
  it('renders a delegate.started handoff as a RUNNING card, not a prose line', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [STARTED_HANDOFF])]} />,
    );
    const card = screen.getByTestId('part-child-card');
    // The card carries the run identity, not the arrow prose.
    expect(card).toHaveTextContent('geospatial');
    expect(card).toHaveTextContent('geospatial #1');
    // Running state uses the ONE kit StatusDot, pulsing.
    const dot = card.querySelector('.kit-statusdot');
    expect(dot?.getAttribute('data-state')).toBe('running');
    // The bare "main -> geospatial" prose line must not ALSO render.
    expect(container.textContent).not.toContain('main -> geospatial');
  });

  it('names the placement when the child runs elsewhere', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { ...STARTED_HANDOFF, host: 'ares', placement: 'relay:ares' },
          ]),
        ]}
      />,
    );
    // A child running through the relay is not the same event as a local one.
    expect(screen.getByTestId('part-child-card')).toHaveTextContent('relay:ares');
  });
});
