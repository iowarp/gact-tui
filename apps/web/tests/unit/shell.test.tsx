/**
 * Shell contract (gact-tui#332) — rail, topbar, ribbon.
 *
 * The shell is pure kit composition over @clio/core store data. These cases
 * pin the structure and the capability rules; geometry is verified visually
 * against the prototype.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/shell/AppShell';
import { Rail, type RailGroup } from '../../src/shell/Rail';

const GROUPS: RailGroup[] = [
  {
    id: 'ws_j4471',
    label: '/scratch/j4471',
    count: 9,
    sessions: [
      { id: 'sess_la', title: 'LA ground motion · EarthScope GNSS', status: 'running', age: 'now' },
      { id: 'sess_ast', title: 'asteroid cut-plane render', status: 'idle', age: '4m' },
      { id: 'sess_tape', title: 'scratch cleanup + tape archive', status: 'running', age: 'now' },
    ],
  },
  {
    id: 'ws_hermes',
    label: '/scratch/hermes',
    count: 1,
    sessions: [{ id: 'sess_h1', title: 'ior baseline sweep', status: 'idle', age: '8d' }],
  },
];

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const props = {
    groups: GROUPS,
    activeSessionId: 'sess_la',
    title: 'LA ground motion · EarthScope GNSS',
    breadcrumb: 'earthscope-gnss-region',
    ribbon: [{ id: 'main', label: 'main' }],
    activeRibbonId: 'main',
    onSelectSession: vi.fn(),
    onSelectRibbon: vi.fn(),
    children: <p>transcript</p>,
    ...overrides,
  };
  return { props, ...render(<AppShell {...props} />) };
}

describe('AppShell', () => {
  it('renders the rail, the topbar and the content region', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: /workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('LA ground motion');
    expect(screen.getByRole('main')).toHaveTextContent('transcript');
  });

  it('lists every workspace group with its sessions', () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: /workspaces/i });
    expect(within(rail).getByText('/scratch/j4471')).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'asteroid cut-plane render' })).toBeInTheDocument();
  });

  it('marks the active session as current', () => {
    renderShell();
    const active = screen.getByRole('button', { name: 'LA ground motion · EarthScope GNSS' });
    expect(active).toHaveAttribute('aria-current', 'true');
  });

  it('selects a session', () => {
    const onSelectSession = vi.fn();
    renderShell({ onSelectSession });
    fireEvent.click(screen.getByRole('button', { name: 'ior baseline sweep' }));
    expect(onSelectSession).toHaveBeenCalledWith('sess_h1');
  });

  it('collapses and restores the rail', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /collapse sessions/i }));
    expect(screen.queryByRole('navigation', { name: /workspaces/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /show sessions/i }));
    expect(screen.getByRole('navigation', { name: /workspaces/i })).toBeInTheDocument();
  });

  it('resizes the rail through the kit splitter', () => {
    renderShell();
    const splitter = screen.getByRole('separator', { name: /rail width/i });
    expect(splitter).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(screen.getByRole('separator', { name: /rail width/i })).toHaveAttribute(
      'aria-valuenow',
      '308',
    );
  });

  it('conveys session status by more than colour', () => {
    renderShell();
    // A 7px dot alone is colour-only; the status must also be readable.
    const active = screen.getByRole('button', { name: 'LA ground motion · EarthScope GNSS' });
    expect(within(active).getByText('running')).toBeInTheDocument();
  });

  it('renders the hierarchy ribbon', () => {
    renderShell();
    expect(screen.getByRole('tablist', { name: /agent hierarchy/i })).toHaveTextContent('main');
  });

  it('hides the workspace console outside the desktop shell', () => {
    // In the prototype exactly one surface is desktop-gated.
    renderShell();
    expect(screen.queryByRole('button', { name: /workspace console/i })).toBeNull();
    expect(screen.getByRole('button', { name: /artifacts/i })).toBeInTheDocument();
  });
});

describe('rail rename', () => {
  it('turns the row into an edit field when Rename is chosen', () => {
    renderShell({ onRenameSession: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for asteroid cut-plane render' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(screen.getByRole('textbox', { name: /session name/i })).toHaveValue(
      'asteroid cut-plane render',
    );
  });

  it('commits the new name for the RIGHT session', () => {
    const onRenameSession = vi.fn();
    renderShell({ onRenameSession });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for ior baseline sweep' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: /session name/i });
    fireEvent.change(box, { target: { value: 'sweep v2' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onRenameSession).toHaveBeenCalledWith('sess_h1', 'sweep v2');
  });

  it('leaves edit mode on Escape without renaming', () => {
    const onRenameSession = vi.fn();
    renderShell({ onRenameSession });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for ior baseline sweep' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: /session name/i }), { key: 'Escape' });
    expect(onRenameSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: /session name/i })).toBeNull();
  });

  it('does not offer rename when the caller cannot perform it', () => {
    // No handler means the surface cannot rename; showing the item would
    // promise something that does nothing.
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for ior baseline sweep' }));
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
  });
});

describe('rail group rows and truncation (C6 / C7)', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      title: `session ${i}`,
      status: 'idle' as const,
      age: '1h',
    }));

  const bigGroup = [
    { id: 'g1', label: '~/rollups', count: 9, sessions: many(9) },
  ];

  it('gives each group a folder icon and a disclosure control', () => {
    render(<Rail groups={bigGroup} activeSessionId="s0" onSelectSession={() => {}} onCollapse={() => {}} />);
    const head = screen.getByTestId('rail-grouphead-g1');
    expect(head.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: /collapse ~\/rollups/i })).toBeInTheDocument();
  });

  it('collapses a group, hiding its sessions', () => {
    render(<Rail groups={bigGroup} activeSessionId="s0" onSelectSession={() => {}} onCollapse={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /collapse ~\/rollups/i }));
    expect(screen.queryByRole('button', { name: 'session 0' })).toBeNull();
    expect(screen.getByRole('button', { name: /expand ~\/rollups/i })).toBeInTheDocument();
  });

  it('truncates a long group and says how many are hidden', () => {
    // The prototype's "show more (4)" — the count is the POINT: "show more"
    // alone does not say whether one session is hidden or forty.
    render(<Rail groups={bigGroup} activeSessionId="s0" onSelectSession={() => {}} onCollapse={() => {}} />);
    const more = screen.getByTestId('rail-showmore-g1');
    expect(more).toHaveTextContent('show more (4)');
    expect(screen.queryByRole('button', { name: 'session 8' })).toBeNull();
  });

  it('reveals the rest on show more', () => {
    render(<Rail groups={bigGroup} activeSessionId="s0" onSelectSession={() => {}} onCollapse={() => {}} />);
    fireEvent.click(screen.getByTestId('rail-showmore-g1'));
    expect(screen.getByRole('button', { name: 'session 8' })).toBeInTheDocument();
    expect(screen.queryByTestId('rail-showmore-g1')).toBeNull();
  });

  it('does not truncate a group that fits', () => {
    const small = [{ id: 'g2', label: '~/small', count: 3, sessions: many(3) }];
    render(<Rail groups={small} activeSessionId="s0" onSelectSession={() => {}} onCollapse={() => {}} />);
    expect(screen.queryByTestId('rail-showmore-g2')).toBeNull();
  });
});

describe('pinned sessions sort first (prototype ordering)', () => {
  // The prototype: byWs[path].filter(x => x.pinned).concat(filter(x => !x.pinned)).
  // Pin is UI organisation, so the order is the client's to apply.
  const group: RailGroup[] = [
    {
      id: 'g1',
      label: '~/rollups',
      count: 3,
      sessions: [
        { id: 'a', title: 'alpha', status: 'idle', age: '1h' },
        { id: 'b', title: 'beta', status: 'idle', age: '2h', pinned: true },
        { id: 'c', title: 'gamma', status: 'idle', age: '3h' },
      ],
    },
  ];

  it('renders pinned rows above unpinned ones', () => {
    render(<Rail groups={group} activeSessionId="a" onSelectSession={() => {}} onCollapse={() => {}} />);
    const titles = Array.from(document.querySelectorAll('.shell-rail__title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('keeps relative order within each pin bucket', () => {
    const two: RailGroup[] = [
      {
        ...group[0]!,
        sessions: [
          { id: 'a', title: 'alpha', status: 'idle', age: '1h' },
          { id: 'b', title: 'beta', status: 'idle', age: '2h', pinned: true },
          { id: 'c', title: 'gamma', status: 'idle', age: '3h', pinned: true },
        ],
      },
    ];
    render(<Rail groups={two} activeSessionId="a" onSelectSession={() => {}} onCollapse={() => {}} />);
    const titles = Array.from(document.querySelectorAll('.shell-rail__title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['beta', 'gamma', 'alpha']);
  });
});

describe('connection swapping from the rail footer (S6)', () => {
  // The footer's "agents N" counts CONNECTED CLIO DEPLOYMENTS — one local, one
  // on ares — and exists so the user can swap between them. It is UI-owned
  // vocabulary, so the pool and the registry drive it, never /v1/agents.
  const CONNECTIONS = [
    { id: 'c1', label: 'local', url: 'http://127.0.0.1:17900', status: 'ready' as const },
    { id: 'c2', label: 'ares', url: 'http://ares:17900', status: 'ready' as const },
    { id: 'c3', label: 'dead', url: 'http://nope:17900', status: 'refused' as const },
  ];

  it('counts only connections that are actually ready', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={() => {}}
        onCollapse={() => {}}
        connections={CONNECTIONS}
        activeConnectionId="c1"
      />,
    );
    // 3 known, 2 usable. Counting the refused one would overstate reach.
    expect(screen.getByTestId('rail-connections')).toHaveTextContent('agents 2');
  });

  it('lists every connection, including one that refused, with its state', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={() => {}}
        onCollapse={() => {}}
        connections={CONNECTIONS}
        activeConnectionId="c1"
        onSwitchConnection={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('rail-connections'));
    // A refused backend is KEPT and shown with its reason; dropping it looks
    // identical to losing the entry.
    expect(screen.getByRole('menuitem', { name: /ares/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /dead/i })).toBeInTheDocument();
  });

  it('switches to the chosen connection', () => {
    const onSwitchConnection = vi.fn();
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={() => {}}
        onCollapse={() => {}}
        connections={CONNECTIONS}
        activeConnectionId="c1"
        onSwitchConnection={onSwitchConnection}
      />,
    );
    fireEvent.click(screen.getByTestId('rail-connections'));
    fireEvent.click(screen.getByRole('menuitem', { name: /ares/i }));
    expect(onSwitchConnection).toHaveBeenCalledWith('c2');
  });

  it('cannot switch to a connection that is not ready', () => {
    const onSwitchConnection = vi.fn();
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={() => {}}
        onCollapse={() => {}}
        connections={CONNECTIONS}
        activeConnectionId="c1"
        onSwitchConnection={onSwitchConnection}
      />,
    );
    fireEvent.click(screen.getByTestId('rail-connections'));
    fireEvent.click(screen.getByRole('menuitem', { name: /dead/i }));
    expect(onSwitchConnection).not.toHaveBeenCalled();
  });
});
