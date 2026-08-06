/**
 * Fanout group (owner, round-7 live fan-out session): "three parallel
 * sibling children render as three ungrouped Call boxes — they want a
 * collapsible Fanout group showing the per-child differentiators, each
 * child clickable exactly like a Call box." Wire contract: every sibling of
 * ONE `spawn_agents_parallel` call carries the SAME `metadata.spawn_group_id`
 * (`fanout_<hex12>`) and `metadata.group_size` on both `delegate.started`
 * and `delegate.completed` stages. A single (non-fanout) delegation, or any
 * session written before this field landed, carries neither field and must
 * render exactly as before — grouping is NEVER inferred from adjacency or
 * timing, only ever this field.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { Transcript } from '../../src/transcript/Transcript';

function msg(id: string, parts: unknown[]): Message {
  return { id, role: 'assistant', parts: parts as Message['parts'] };
}

const GROUP_ID = 'fanout_abc123def456';

function sibling(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'expert_handoff',
    child_agent: 'geospatial',
    stage: 'delegate.completed',
    status: 'completed',
    handle_id: 'task_default',
    run_label: 'geospatial #1',
    duration_ms: 12000,
    metadata: {
      question: 'Resolve a station into coordinates.',
      output: 'Resolved.',
      spawn_group_id: GROUP_ID,
      group_size: 3,
    },
    ...overrides,
  };
}

const THREE_SIBLINGS = [
  sibling({
    handle_id: 'task_a',
    run_label: 'geospatial #1',
    metadata: {
      question: 'Resolve station A into coordinates.',
      output: 'A resolved.',
      spawn_group_id: GROUP_ID,
      group_size: 3,
    },
  }),
  sibling({
    handle_id: 'task_b',
    run_label: 'geospatial #2',
    stage: 'delegate.started',
    status: 'running',
    duration_ms: undefined,
    metadata: { question: 'Resolve station B into coordinates.', spawn_group_id: GROUP_ID, group_size: 3 },
  }),
  sibling({
    handle_id: 'task_c',
    run_label: 'geospatial #3',
    metadata: {
      question: 'Resolve station C into coordinates.',
      output: 'C resolved.',
      spawn_group_id: GROUP_ID,
      group_size: 3,
    },
  }),
];

describe('fanout group — siblings sharing spawn_group_id fold into ONE frame', () => {
  it('renders ONE fanout frame with N child rows, titled by the shared agent name × total', () => {
    render(<Transcript messages={[msg('m1', THREE_SIBLINGS)]} />);
    const frames = screen.getAllByTestId('part-fanout-group');
    expect(frames).toHaveLength(1);
    expect(within(frames[0]!).getByText('fanout(geospatial × 3)')).toBeInTheDocument();
    expect(screen.getAllByTestId('part-fanout-child')).toHaveLength(3);
    // No individual Call() headings — the siblings are folded, not duplicated.
    expect(screen.queryByText(/^Call\(geospatial\)$/)).toBeNull();
  });

  it('titles a heterogeneous fanout by agent count, not a single (wrong) name', () => {
    const mixed = [
      sibling({ handle_id: 'task_a', child_agent: 'geospatial' }),
      sibling({ handle_id: 'task_b', child_agent: 'hydrology' }),
      sibling({ handle_id: 'task_c', child_agent: 'seismic' }),
    ];
    render(<Transcript messages={[msg('m1', mixed)]} />);
    expect(screen.getByText('fanout(3 agents)')).toBeInTheDocument();
  });

  it('shows each child\'s own differentiator (metadata.question), status, and duration when expanded', () => {
    render(<Transcript messages={[msg('m1', THREE_SIBLINGS)]} />);
    const rows = screen.getAllByTestId('part-fanout-child');
    expect(rows[0]).toHaveTextContent('Resolve station A into coordinates.');
    expect(rows[0]).toHaveTextContent('geospatial #1');
    expect(rows[0]).toHaveTextContent('completed');
    // The running sibling shows the amber running state inside the frame,
    // not a settled mark.
    expect(rows[1]).toHaveTextContent('running');
    expect(rows[1]?.querySelector('.kit-statusdot')).toHaveAttribute('data-state', 'running');
  });

  it('a child row opens the SAME way a lone Call box does: click -> center, shift-click -> peek', () => {
    const onOpenChild = vi.fn();
    render(<Transcript messages={[msg('m1', THREE_SIBLINGS)]} onOpenChild={onOpenChild} />);
    const rows = screen.getAllByTestId('part-fanout-child');

    fireEvent.click(rows[0]!);
    expect(onOpenChild).toHaveBeenLastCalledWith('task_a', 'geospatial', { peek: false });

    fireEvent.click(rows[2]!, { shiftKey: true });
    expect(onOpenChild).toHaveBeenLastCalledWith('task_c', 'geospatial', { peek: true });

    expect(onOpenChild).toHaveBeenCalledTimes(2);
  });

  it('collapsing the frame keeps ONE line per child (name · status · duration) and their click targets', () => {
    const onOpenChild = vi.fn();
    render(<Transcript messages={[msg('m1', THREE_SIBLINGS)]} onOpenChild={onOpenChild} />);
    const toggle = screen.getByRole('button', { name: /fanout\(geospatial × 3\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // The differentiator text is gone once collapsed...
    expect(screen.queryByText('Resolve station A into coordinates.')).toBeNull();
    // ...but the one-line summary (name/status/duration) is still there per child.
    const rows = screen.getAllByTestId('part-fanout-child');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('geospatial #1');
    expect(rows[0]).toHaveTextContent('completed');

    // Still clickable, same callback, collapsed or not.
    fireEvent.click(rows[0]!);
    expect(onOpenChild).toHaveBeenCalledWith('task_a', 'geospatial', { peek: false });
  });

  it('names the total from metadata.group_size even before every sibling part has streamed in', () => {
    // Only 2 of 3 declared siblings have arrived on the wire so far — the
    // group_size field is the declared total, not a count of what rendered.
    const partial = [THREE_SIBLINGS[0]!, THREE_SIBLINGS[1]!];
    render(<Transcript messages={[msg('m1', partial)]} />);
    expect(screen.getByText('fanout(geospatial × 3)')).toBeInTheDocument();
    expect(screen.getAllByTestId('part-fanout-child')).toHaveLength(2);
  });
});

describe('fanout group — absent spawn_group_id renders exactly as before (regression pin)', () => {
  it('multiple handoff parts with NO spawn_group_id render as separate Call boxes, never grouped', () => {
    const noGroup = [
      {
        type: 'expert_handoff',
        child_agent: 'geospatial',
        stage: 'delegate.completed',
        status: 'completed',
        handle_id: 'task_x',
        run_label: 'geospatial #1',
        metadata: { question: 'Resolve station X.', output: 'X resolved.' },
      },
      {
        type: 'expert_handoff',
        child_agent: 'hydrology',
        stage: 'delegate.completed',
        status: 'completed',
        handle_id: 'task_y',
        run_label: 'hydrology #1',
        metadata: { question: 'Resolve station Y.', output: 'Y resolved.' },
      },
    ];
    render(<Transcript messages={[msg('m1', noGroup)]} />);
    expect(screen.queryByTestId('part-fanout-group')).toBeNull();
    expect(screen.queryByTestId('part-fanout-child')).toBeNull();
    expect(screen.getByText('Call(geospatial)')).toBeInTheDocument();
    expect(screen.getByText('Call(hydrology)')).toBeInTheDocument();
    expect(screen.getAllByTestId('part-child-card')).toHaveLength(2);
  });

  it('a single handoff (no siblings at all) is unaffected by the fanout path', () => {
    render(
      <Transcript
        messages={[
          msg('m1', [
            {
              type: 'expert_handoff',
              child_agent: 'geospatial',
              stage: 'delegate.completed',
              status: 'completed',
              handle_id: 'task_solo',
              run_label: 'geospatial #1',
              metadata: { question: 'Resolve LA.', output: 'Resolved.' },
            },
          ]),
        ]}
      />,
    );
    expect(screen.queryByTestId('part-fanout-group')).toBeNull();
    expect(screen.getByText('Call(geospatial)')).toBeInTheDocument();
  });
});
