/**
 * Slice E-live contract — the CLEAN delegation wire (2026-08-05):
 *
 * ONE `expert_handoff` part per delegation. clio-agent updates the started
 * part in place when the delegation settles (`message.part.updated`), so a
 * settled message carries a single part whose metadata holds BOTH the brief
 * (`metadata.question`) and the child's answer (`metadata.output`), plus the
 * real `duration_ms`. The UI renders exactly what arrives — it never pairs,
 * merges, or hides parts (owner rule: no clio-specific dedup semantics in
 * the client; the wire is clean at the source).
 *
 * Presentation (owner correction 2026-08-05 + prototype div.scpg): ONE
 * unified box per delegation — heading, brief, answer, status footer — the
 * whole box clickable (click → center child view, shift-click → right peek),
 * and NO handle pill.
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
  metadata: { question: 'Resolve LA into coordinates.' },
};

/** The settled shape: the SAME part, updated in place by the server. */
const SETTLED_HANDOFF = {
  ...STARTED_HANDOFF,
  stage: 'delegate.completed',
  live_state: 'completed',
  status: 'completed',
  duration_ms: 72000,
  metadata: {
    question: 'Resolve LA into coordinates.',
    output: 'Resolved LA to center 34.0537, -118.2428.',
  },
};

describe('delegation box (E5, clean single-part wire)', () => {
  it('renders a delegate.started handoff as a RUNNING box, not a prose line', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [STARTED_HANDOFF])]} />,
    );
    const card = screen.getByTestId('part-child-card');
    // The box carries the run identity, not the arrow prose.
    expect(card).toHaveTextContent('geospatial');
    expect(card).toHaveTextContent('geospatial #1');
    // Running state uses the ONE kit StatusDot, pulsing, and the amber footer.
    const dot = card.querySelector('.kit-statusdot');
    expect(dot?.getAttribute('data-state')).toBe('running');
    expect(card).toHaveTextContent('● running');
    // A running delegation has no answer body yet.
    expect(card.querySelector('.part-childcard__body')).toBeNull();
    // The bare "main -> geospatial" prose line must not ALSO render.
    expect(container.textContent).not.toContain('main -> geospatial');
  });

  it('renders the settled part as ONE box with brief, answer, and real duration', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [SETTLED_HANDOFF])]} />,
    );
    expect(screen.getAllByText('Call(geospatial)')).toHaveLength(1);
    const card = screen.getByTestId('part-child-card');
    // Success is quiet: no dot (prototype isTask grammar), teal footer with
    // the wire's duration_ms formatted in the prototype idiom.
    expect(card.querySelector('.kit-statusdot')).toBeNull();
    expect(card).toHaveTextContent('completed ✓ 1m 12s');
    expect(card).toHaveTextContent('Resolved LA to center 34.0537, -118.2428.');
    // The brief renders once, outside the box, from the same part's metadata.
    expect(container.textContent).toContain('Resolve LA into coordinates.');
    expect(container.textContent).not.toContain('main <- geospatial');
  });

  it('omits the duration when the wire carries none', () => {
    const { duration_ms: _drop, ...noDuration } = SETTLED_HANDOFF;
    render(<Transcript messages={[msg('m1', 'assistant', [noDuration])]} />);
    const card = screen.getByTestId('part-child-card');
    expect(card.textContent).not.toMatch(/\d+m \d+s/);
    expect(card).toHaveTextContent('completed ✓');
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

  it('marks a failed delegation red, never the neutral idle dot (E5 addendum)', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              ...SETTLED_HANDOFF,
              id: 'live_handoff_failed',
              stage: 'delegate.failed',
              live_state: 'failed',
              status: 'failed',
              metadata: { question: 'Resolve LA into coordinates.' },
            },
          ]),
        ]}
      />,
    );
    const card = screen.getByTestId('part-child-card');
    const dot = card.querySelector('.kit-statusdot');
    expect(dot?.getAttribute('data-state')).toBe('error');
    expect(card).toHaveTextContent('failed ✗');
  });

  it('carries NO handle pill — the unified box is the whole presentation (owner rule)', () => {
    render(
      <Transcript
        messages={[msg('m1', 'assistant', [STARTED_HANDOFF]), msg('m2', 'assistant', [SETTLED_HANDOFF])]}
      />,
    );
    expect(screen.queryByTestId('part-handle')).toBeNull();
  });
});

describe('no client-side dedup — the UI renders the wire verbatim (owner rule 2026-08-05)', () => {
  it('a legacy started+terminal PAIR renders as two boxes: dedup lives in clio-agent, never here', () => {
    // Pre-cleanup sessions persisted two parts per delegation. The client must
    // NOT merge them — the server's in-place update (message.part.updated)
    // is the single owner of that semantics. Two parts in = two boxes out.
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            STARTED_HANDOFF,
            { ...SETTLED_HANDOFF, id: 'live_handoff_terminal' },
          ]),
        ]}
      />,
    );
    expect(screen.getAllByTestId('part-child-card')).toHaveLength(2);
  });

  it('two delegations are two parts are two blocks', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            SETTLED_HANDOFF,
            {
              ...SETTLED_HANDOFF,
              id: 'h2',
              child_agent: 'ndp',
              run_label: 'ndp #1',
              handle_id: 'task_other',
            },
          ]),
        ]}
      />,
    );
    expect(screen.getAllByTestId('part-child-card')).toHaveLength(2);
    expect(screen.getAllByText('Call(geospatial)')).toHaveLength(1);
    expect(screen.getAllByText('Call(ndp)')).toHaveLength(1);
  });
});

describe('delegation box interactivity (W2 — the whole box is the prototype goCall target)', () => {
  it('is a button with the prototype title when onOpenChild is provided, and clicks back with the handle', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const calls: unknown[] = [];
    render(
      <Transcript
        messages={[msg('m1', 'assistant', [SETTLED_HANDOFF])]}
        onOpenChild={(handleId, agent, opts) => calls.push([handleId, agent, opts])}
      />,
    );
    const card = screen.getByTestId('part-child-card');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('title', 'Open agent · shift-click to peek in the side panel');
    fireEvent.click(card);
    expect(calls).toEqual([['task_8562bd68e4d5', 'geospatial', { peek: false }]]);
    fireEvent.click(card, { shiftKey: true });
    expect(calls[1]).toEqual(['task_8562bd68e4d5', 'geospatial', { peek: true }]);
  });

  it('a running box advertises the live destination in its title', () => {
    render(
      <Transcript
        messages={[msg('m1', 'assistant', [STARTED_HANDOFF])]}
        onOpenChild={() => {}}
      />,
    );
    expect(screen.getByTestId('part-child-card')).toHaveAttribute(
      'title',
      'Open live agent · shift-click to peek in the side panel',
    );
  });

  it('stays non-interactive without a handler (an affordance that does nothing is a lie)', () => {
    render(<Transcript messages={[msg('m1', 'assistant', [SETTLED_HANDOFF])]} />);
    expect(screen.getByTestId('part-child-card')).not.toHaveAttribute('role');
  });
});
