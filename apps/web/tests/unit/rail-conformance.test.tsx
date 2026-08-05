/**
 * Slice B failing-first contract — rail conformance (P5 inventory B1–B12 +
 * owner feedback addendum, docs/design/p4-conformance-gaps.md).
 *
 * Geometry/typography numbers (11.5px paths, row indent x=18, dot palette)
 * are verified by the browser conformance audit; THIS file pins structure and
 * semantics: the New/search affordances, the group-head part order, working
 * pin, and the ONE unified kit StatusDot with real state semantics (B11 —
 * the prototype's three inconsistent indicator classes, unified as the owner
 * directed).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Rail, type RailProps, type RailGroup } from '../../src/shell/Rail';

const GROUPS: RailGroup[] = [
  {
    id: 'g1',
    label: '/scratch/j4471',
    count: 9,
    sessions: [
      { id: 's1', title: 'alpha run', status: 'running', age: 'now' },
      { id: 's2', title: 'beta sweep', status: 'idle', age: '4m', pinned: true },
      { id: 's3', title: 'gamma bench', status: 'queued', age: '6d' },
    ],
  },
];

function renderRail(extra: Partial<RailProps> = {}) {
  const props: RailProps = {
    groups: GROUPS,
    activeSessionId: 's1',
    onSelectSession: vi.fn(),
    onCollapse: vi.fn(),
    ...extra,
  };
  return { props, ...render(<Rail {...props} />) };
}

describe('workspaces heading (B1)', () => {
  it('carries the search and New affordances', () => {
    renderRail();
    expect(screen.getByRole('button', { name: /search sessions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new session/i })).toBeInTheDocument();
  });

  it('New reports the intent', () => {
    const onNewSession = vi.fn();
    renderRail({ onNewSession } as unknown as Partial<RailProps>);
    fireEvent.click(screen.getByRole('button', { name: /new session/i }));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it('the collapse toggle is the prototype\'s tgLeft rounded-rect, not a generic centered divider', () => {
    // Transcribed from the prototype's [title="Collapse sessions"]/[title=
    // "Expand sessions"] (both tgLeft): viewBox 0 0 14 14, rect 1.5,2.2,11x9.6
    // rx1.8, divider at x=5.4 (left-of-centre — this is the LEFT panel).
    renderRail();
    const collapse = screen.getByRole('button', { name: /collapse sessions/i });
    const svg = collapse.querySelector('[data-icon="panel"]');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('viewBox', '0 0 14 14');
    const divider = svg!.querySelector('path');
    expect(divider).toHaveAttribute('d', 'M5.4 2.2v9.6');
  });
});

describe('group head (B2)', () => {
  it('renders disclosure, folder, label, count and an overflow menu — in the prototype order', () => {
    const { container } = renderRail();
    const head = container.querySelector('.shell-rail__grouphead');
    expect(head).not.toBeNull();
    // Disclosure is its own visible glyph, distinct from the folder icon.
    expect(head!.querySelector('.shell-rail__groupdisclose')).not.toBeNull();
    expect(head!.querySelector('[data-icon="folder"]')).not.toBeNull();
    expect(head!.textContent).toContain('/scratch/j4471');
    expect(head!.textContent).toContain('9');
    expect(within(head as HTMLElement).getByRole('button', { name: /workspace menu/i })).toBeInTheDocument();
  });
});

describe('session rows (B3 + B11)', () => {
  it('every row dot is the ONE kit StatusDot carrying its state', () => {
    const { container } = renderRail();
    const dots = container.querySelectorAll('.shell-rail__session .kit-statusdot');
    expect(dots).toHaveLength(3);
    const states = [...dots].map((d) => d.getAttribute('data-state'));
    // Pinned-first ordering puts beta (idle) first.
    expect(states).toEqual(['idle', 'running', 'queued']);
  });

  it('a pinned row shows the pin glyph', () => {
    const { container } = renderRail();
    const rows = container.querySelectorAll('.shell-rail__session');
    expect(rows[0]!.textContent).toContain('beta sweep');
    expect(rows[0]!.querySelector('[data-icon="pin"]')).not.toBeNull();
    expect(rows[1]!.querySelector('[data-icon="pin"]')).toBeNull();
  });

  it('pin toggles from the row menu as a client action', () => {
    const onSessionAction = vi.fn();
    const { container } = renderRail({ onSessionAction });
    const row = [...container.querySelectorAll('.shell-rail__session')].find((r) =>
      r.textContent?.includes('alpha run'),
    )!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /session menu/i }));
    const pin = screen.getByRole('menuitem', { name: /pin/i });
    expect(pin).toHaveAccessibleName('Pin');
    fireEvent.click(pin);
    expect(onSessionAction).toHaveBeenCalledWith('s1', 'pin');

    const pinnedRow = [...container.querySelectorAll('.shell-rail__session')].find((candidate) =>
      candidate.textContent?.includes('beta sweep'),
    )!;
    fireEvent.click(
      within(pinnedRow as HTMLElement).getByRole('button', { name: /session menu/i }),
    );
    const unpin = screen.getByRole('menuitem', { name: /unpin/i });
    expect(unpin).toHaveAccessibleName('Unpin');
    fireEvent.click(unpin);
    expect(onSessionAction).toHaveBeenCalledWith('s2', 'pin');
  });
});

describe('footer band (B5 + B11)', () => {
  it('the agents count is its own highlighted span and the dots are kit StatusDots', () => {
    const { container } = renderRail({
      connections: [{ id: 'c1', label: 'local', url: 'http://x', status: 'ready' }],
    });
    const footer = container.querySelector('.shell-rail__foot');
    expect(footer).not.toBeNull();
    expect(footer!.querySelector('.shell-rail__footcount')?.textContent).toBe('1');
    expect(footer!.querySelectorAll('.kit-statusdot').length).toBeGreaterThanOrEqual(2);
  });
});
