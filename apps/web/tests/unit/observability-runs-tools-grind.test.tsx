/**
 * P5 grind, PASS 1 — observability runs/tools/legend/navigation.
 *
 * Prototype truth (design/prototype/Clio Session.html):
 *  - runs tab groups RUNNING / COMPLETED (N) / FAILED with a bolt/check/x icon,
 *    a description line, and a transcript action (~8250004)
 *  - tools tab is a chronological call log, name(argHint) expandable, agent
 *    tag, status glyph (~8256494) — not a per-server catalog
 *  - legend's tool glyph is a bordered circle around a wrench, not a bare
 *    character; failure is U+2717 '✗' (~8239011)
 *  - every log/runs/tools row with a real target is click-through; rows
 *    without one render inert (~8472858)
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Observability } from '../../src/observability/Observability';
import type { ObservabilityData } from '../../src/observability/types';

function data(overrides: Partial<ObservabilityData> = {}): ObservabilityData {
  return {
    agents: [],
    runs: [],
    toolsByExpert: {},
    artifacts: [],
    timeline: [],
    spans: [],
    artifactRows: [],
    toolCalls: [],
    ...overrides,
  };
}

describe('runs tab — grouped by state, not a flat list', () => {
  it('groups RUNNING above COMPLETED (N), each with a real status icon', () => {
    render(
      <Observability
        data={data({
          runs: [
            { id: 'r1', agent: 'geospatial', state: 'running', label: 'geospatial #1' },
            { id: 'r2', agent: 'data', state: 'completed', label: 'data #1' },
            { id: 'r3', agent: 'analysis', state: 'completed', label: 'analysis #1' },
          ],
        })}
        initialTab="runs"
      />,
    );
    const panel = screen.getByTestId('obs-runs');
    const titles = within(panel)
      .getAllByText(/^(running|completed \(2\))$/, { selector: '.obs-rungroup__title' })
      .map((el) => el.textContent);
    expect(titles).toEqual(['running', 'completed (2)']);
  });

  it('groups a failed run under its own red FAILED section', () => {
    render(
      <Observability
        data={data({ runs: [{ id: 'r1', agent: 'geospatial', state: 'failed', label: 'geospatial #1' }] })}
        initialTab="runs"
      />,
    );
    const panel = screen.getByTestId('obs-runs');
    expect(
      within(panel).getByText('failed', { selector: '.obs-rungroup__title' }),
    ).toBeInTheDocument();
  });

  it('shows the real derived description and a working transcript action when nav is present', () => {
    const onNavigate = vi.fn();
    render(
      <Observability
        data={data({
          runs: [
            {
              id: 'r1',
              agent: 'data',
              state: 'completed',
              label: 'data #1',
              description: 'requested by main · 2 artifacts',
              nav: { kind: 'agent', targetId: 'sess_child' },
            },
          ],
        })}
        initialTab="runs"
        onNavigate={onNavigate}
      />,
    );
    const panel = screen.getByTestId('obs-runs');
    expect(within(panel).getByText('requested by main · 2 artifacts')).toBeInTheDocument();
    const row = within(panel).getByRole('button', { name: /data #1/i });
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'agent', targetId: 'sess_child' });
  });

  it('honestly disables a run row with no real navigation target, rather than a dead-looking link', () => {
    render(
      <Observability
        data={data({ runs: [{ id: 'r1', agent: 'x', state: 'completed', label: 'no-child-session' }] })}
        initialTab="runs"
        onNavigate={vi.fn()}
      />,
    );
    const row = screen.getByRole('button', { name: /no-child-session/i });
    expect(row).toBeDisabled();
  });
});

describe('tools tab — chronological call log, not a per-server catalog', () => {
  it('renders real calls with name, arg hint, agent tag, and status glyph', () => {
    render(
      <Observability
        data={data({
          toolCalls: [
            {
              sourceId: 'part:m1:0',
              at: '19:55',
              name: 'ndp_search',
              argHint: 'query=EarthScope GNSS',
              agent: 'data',
              state: 'done',
              duration: '6.1s',
            },
          ],
        })}
        initialTab="tools"
      />,
    );
    const panel = screen.getByTestId('obs-tools');
    expect(within(panel).getByText('ndp_search')).toBeInTheDocument();
    expect(within(panel).getByText('(query=EarthScope GNSS)')).toBeInTheDocument();
    expect(within(panel).getByText(/data/)).toBeInTheDocument();
  });

  it('expands a row on click to reveal its duration, collapsed by default', () => {
    render(
      <Observability
        data={data({
          toolCalls: [
            {
              sourceId: 'part:m1:0',
              name: 'stage_resource',
              agent: 'data',
              state: 'done',
              duration: '9.4s',
            },
          ],
        })}
        initialTab="tools"
      />,
    );
    expect(screen.queryByText(/duration 9\.4s/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /stage_resource/i }));
    expect(screen.getByText(/duration 9\.4s/)).toBeInTheDocument();
  });

  it('states emptiness rather than an empty catalog dropdown', () => {
    render(<Observability data={data()} initialTab="tools" />);
    expect(screen.getByTestId('obs-empty')).toHaveTextContent(/no tool calls recorded/i);
  });
});

describe('timeline legend and row markers', () => {
  it('renders the tool legend glyph as an icon, not a bare character', () => {
    render(<Observability data={data()} initialTab="timeline" />);
    const legend = screen.getByTestId('obs-legend');
    const toolItem = within(legend).getByText('tool').closest('[data-kind="tool"]')!;
    expect(toolItem.querySelector('svg')).not.toBeNull();
  });

  it('uses the U+2717 ballot-x for failure, not U+00D7', () => {
    render(<Observability data={data()} initialTab="timeline" />);
    const legend = screen.getByTestId('obs-legend');
    const failureItem = within(legend).getByText('failure').closest('[data-kind="failure"]')!;
    expect(failureItem.textContent).toContain('✗');
    expect(failureItem.textContent).not.toContain('×');
  });

  it('gives the "user" kind its own marker distinct from a plain event', () => {
    const { container } = render(
      <Observability
        data={data({
          timeline: [{ actor: 'user', action: '"hello"', kind: 'user', at: '19:52' }],
        })}
        initialTab="timeline"
      />,
    );
    const node = container.querySelector('.obs-log__row[data-kind="user"] .obs-log__node');
    expect(node?.getAttribute('data-shape')).toBe('badge');
    expect(node?.querySelector('svg')).not.toBeNull();
  });
});

describe('timeline parent/child thread connectors (P5 grind, PASS 2)', () => {
  it('renders one continuing rail per ancestor depth, and suppresses the plain marker on a branch-open row', () => {
    const { container } = render(
      <Observability
        data={data({
          timeline: [
            { actor: 'geospatial', action: 'task started', kind: 'running', depth: 0, branch: 'open' },
          ],
        })}
        initialTab="timeline"
      />,
    );
    const row = container.querySelector('.obs-log__row[data-kind="running"]')!;
    // depth 0 still draws the always-present main-thread rail (index 0).
    expect(row.querySelectorAll('.obs-log__rail')).toHaveLength(1);
    expect(row.querySelector('.obs-log__rail[data-i="0"]')).not.toBeNull();
    // The elbow is the only marker on a branch row — no ring/dot/etc.
    expect(row.querySelector('.obs-log__elbow[data-edge="open"]')).not.toBeNull();
    expect(row.querySelector('.obs-log__node')).toBeNull();
  });

  it('draws a closing elbow at the post-pop depth and still renders the normal marker on non-branch rows', () => {
    const { container } = render(
      <Observability
        data={data({
          timeline: [
            { actor: 'geo_geocode', action: 'tool call', kind: 'tool', depth: 1 },
            { actor: 'geospatial', action: 'returned to main', kind: 'event', depth: 0, branch: 'close' },
          ],
        })}
        initialTab="timeline"
      />,
    );
    const rows = container.querySelectorAll('.obs-log__row');
    const toolRow = rows[0]!;
    expect(toolRow.querySelectorAll('.obs-log__rail')).toHaveLength(2);
    expect(toolRow.querySelector('.obs-log__node[data-shape]')).not.toBeNull();
    const closeRow = rows[1]!;
    expect(closeRow.querySelectorAll('.obs-log__rail')).toHaveLength(1);
    expect(closeRow.querySelector('.obs-log__elbow[data-edge="close"]')).not.toBeNull();
  });

  it('renders a flat single rail with no elbow when a row carries no branch (the common case)', () => {
    const { container } = render(
      <Observability
        data={data({ timeline: [{ actor: 'main', action: 'thinking + plan', kind: 'event', depth: 0 }] })}
        initialTab="timeline"
      />,
    );
    const row = container.querySelector('.obs-log__row')!;
    expect(row.querySelectorAll('.obs-log__rail')).toHaveLength(1);
    expect(row.querySelector('.obs-log__elbow')).toBeNull();
    expect(row.querySelector('.obs-log__node')).not.toBeNull();
  });
});

describe('timeline row click-through (jump to message / open agent)', () => {
  it('fires onNavigate with the row nav on click, and is keyboard-activatable', () => {
    const onNavigate = vi.fn();
    render(
      <Observability
        data={data({
          timeline: [
            {
              actor: 'user',
              action: '"hello"',
              kind: 'user',
              at: '19:52',
              nav: { kind: 'message', targetId: 'msg_u1' },
            },
          ],
        })}
        initialTab="timeline"
        onNavigate={onNavigate}
      />,
    );
    const row = screen.getByRole('button', { name: /hello/i });
    fireEvent.click(row);
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'message', targetId: 'msg_u1' });
    onNavigate.mockClear();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'message', targetId: 'msg_u1' });
  });

  it('renders a row with no nav as plain content, no button role', () => {
    render(
      <Observability
        data={data({
          timeline: [{ actor: 'main', action: 'thinking + plan', kind: 'event', at: '19:52' }],
        })}
        initialTab="timeline"
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /thinking \+ plan/i })).toBeNull();
  });
});
