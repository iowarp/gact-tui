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

  it('renders a delegate.completed handoff as a COMPLETED card', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              ...STARTED_HANDOFF,
              id: 'live_handoff_dfda2a286781',
              text: 'main <- geospatial',
              stage: 'delegate.completed',
              live_state: 'completed',
              status: 'completed',
            },
          ]),
        ]}
      />,
    );
    const card = screen.getByTestId('part-child-card');
    expect(card).toHaveTextContent('geospatial');
    // Completed successfully: the prototype's own completed-card header
    // carries no dot at all (isTask) — running/failed are the two states
    // worth a mark, not a plain success. And NO fabricated duration (the
    // wire carries none; the prototype's "4m 38s" has no source yet).
    expect(card.querySelector('.kit-statusdot')).toBeNull();
    expect(card.textContent).not.toMatch(/\d+m \d+s/);
    expect(container.textContent).not.toContain('main <- geospatial');
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

  it('shows the completion excerpt from metadata.output (live-observed field)', () => {
    // Captured live (sess_a7d05dfd2371, geospatial #1): a completed
    // expert_handoff's excerpt rides in `metadata.output`, the same place
    // `metadata.question` rides for delegate.started.
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              ...STARTED_HANDOFF,
              id: 'live_handoff_235389bb500c',
              stage: 'delegate.completed',
              live_state: 'completed',
              status: 'completed',
              metadata: { output: "Resolved 'Los Angeles' to center 34.0537, -118.2428." },
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByTestId('part-child-card')).toHaveTextContent(
      "Resolved 'Los Angeles' to center 34.0537, -118.2428.",
    );
  });

  it('never claims clickability it cannot honor (no focused-agent-transcript pane exists yet, E9)', () => {
    // The prototype's own goChild div is role="button" tabindex="0" with a
    // real click destination (the focused agent transcript). This build has
    // no such pane anywhere under apps/web/src, so the card must not LIE
    // about being interactive — no role, no tabindex, no cursor:pointer click
    // target. An affordance that does nothing on click is worse than none.
    render(<Transcript messages={[msg('m1', 'assistant', [STARTED_HANDOFF])]} />);
    const card = screen.getByTestId('part-child-card');
    expect(card).not.toHaveAttribute('role');
    expect(card).not.toHaveAttribute('tabindex');
  });

  it('marks a failed delegation red, never the neutral idle dot (E5 addendum)', () => {
    // Live-observed: the narration explicitly says the child "fully failed
    // (delegate.failed, error_reason=agent_error)" while the card still
    // rendered the plain gray idle dot, identical to a normal completion.
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              ...STARTED_HANDOFF,
              id: 'live_handoff_failed',
              stage: 'delegate.failed',
              live_state: 'failed',
              status: 'failed',
            },
          ]),
        ]}
      />,
    );
    const card = screen.getByTestId('part-child-card');
    const dot = card.querySelector('.kit-statusdot');
    expect(dot?.getAttribute('data-state')).toBe('error');
  });
});

describe('run-handle pill (isTask sg.handle, PASS 3 — tree moved since the pass-2 measurement)', () => {
  // Pass 2 read `handle_id` as absent from every observed sample and left the
  // prototype's optional handle pill unbuilt on that basis. Re-measured
  // against the CURRENT live backend (10/10 expert_handoff samples across 5
  // full delegation chains, 2026-08): handle_id is real and always present.
  it('shows the real handle id with a pulsing dot while the delegation is running', () => {
    render(<Transcript messages={[msg('m1', 'assistant', [STARTED_HANDOFF])]} />);
    const pill = screen.getByTestId('part-handle');
    expect(pill).toHaveTextContent('task_8562bd68e4d5');
    // The literal wire word, not invented copy.
    expect(pill).toHaveTextContent('running');
    expect(pill.querySelector('.part-handle__dot')).not.toBeNull();
  });

  it('drops the pulsing dot and shows the real completed state on a finished delegation', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { ...STARTED_HANDOFF, stage: 'delegate.completed', live_state: 'completed', status: 'completed' },
          ]),
        ]}
      />,
    );
    const pill = screen.getByTestId('part-handle');
    expect(pill).toHaveTextContent('task_8562bd68e4d5');
    expect(pill).toHaveTextContent('completed');
    expect(pill.querySelector('.part-handle__dot')).toBeNull();
  });

  it('never invents a handle id or pill when the wire carries none', () => {
    const { handle_id: _drop, ...withoutHandle } = STARTED_HANDOFF as typeof STARTED_HANDOFF & {
      handle_id?: string;
    };
    render(<Transcript messages={[msg('m1', 'assistant', [withoutHandle])]} />);
    expect(screen.queryByTestId('part-handle')).toBeNull();
  });

  it('is not interactive — no destination pane exists for it to open honestly (paired with E9, same rule as the child card)', () => {
    render(<Transcript messages={[msg('m1', 'assistant', [STARTED_HANDOFF])]} />);
    const pill = screen.getByTestId('part-handle');
    expect(pill).not.toHaveAttribute('role');
    expect(pill).not.toHaveAttribute('tabindex');
  });
});
