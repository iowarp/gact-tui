/**
 * P5 grind, PASS 1, rail-and-topbar (docs/p5/conformance/rail-and-topbar.json)
 * re-verification. Most of the surface's non-"match" items were already
 * fixed by an earlier pass (owner-review-1); this file locks the residue:
 *
 * - the rail's "open in files" workspace-menu action must open the WORKSPACE
 *   THE USER CLICKED, not whatever workspace the currently active session
 *   happens to sit in — the two were sharing one piece of state
 *   (`newWorkspaceId`) that let an unrelated action win the race.
 * - search's workspace rows now "navigate there" (open that workspace's
 *   files), matching the session rows' click semantics instead of being a
 *   dead no-op.
 * - the rail's New(+) button gets its own cyan hover, distinct from Search's
 *   neutral one; the "agents" footer cell states what clicking it actually
 *   does.
 * - the topbar's cyan hover (files/console/artifacts/ctx/obs) carries the
 *   background+border tint the prototype's style-hover attribute specifies,
 *   not just a text-color change.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client, Message, Session, Workspace } from '@clio/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rail } from '../../src/shell/Rail';
import { SearchDialog } from '../../src/session/SessionDialogs';
import { SessionView } from '../../src/session/SessionView';

const WORKSPACES: Workspace[] = [
  { id: 'ws_a', name: 'alpha', root_path: '/scratch/alpha' },
  { id: 'ws_b', name: 'bravo', root_path: '/scratch/bravo' },
] as unknown as Workspace[];

const SESSIONS = [
  { id: 'sess_a', title: 'alpha run', status: 'running', workspace_id: 'ws_a' },
  { id: 'sess_b', title: 'bravo run', status: 'idle', workspace_id: 'ws_b' },
] as unknown as Session[];

const MESSAGES: Message[] = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ready' }] },
] as unknown as Message[];

function client(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    getSession: vi.fn(async () => ({
      id: 'sess_a',
      workspace_id: 'ws_a',
      approval_mode: 'ask',
    })),
    workspaces: vi.fn(async () => ({ workspaces: WORKSPACES })),
    commands: vi.fn(async () => ({ commands: [] })),
    get: vi.fn(async () => ({ tasks: [] })),
    workspaceFiles: vi.fn(async () => ({ files: [], next_cursor: null })),
    // The New dialog's own effect fetches these on open (SessionDialogs.tsx
    // NewDialog) — only exercised by the "+" wiring test below, but every
    // caller of client() gets a real mock rather than a thrown TypeError.
    agentBlueprints: vi.fn(async () => ({ blueprints: [] })),
    expertPacks: vi.fn(async () => ({ packs: [] })),
    createSession: vi.fn(async () => ({ id: 'sess_new', workspace_id: 'ws_a' })),
    ...overrides,
  } as unknown as Client;
}

afterEach(() => {
  delete (window as { isTauri?: boolean }).isTauri;
});

describe('rail search + New affordances', () => {
  it('names the search trigger with the full prototype title, not a truncation', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        onOpenSearch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Search sessions and workspaces' }),
    ).toBeInTheDocument();
  });

  it('gives New its own accent class, distinct from Search — the prototype hovers them in different colors', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        onOpenSearch={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );
    const search = screen.getByRole('button', { name: 'Search sessions and workspaces' });
    const add = screen.getByRole('button', { name: 'New session' });
    expect(search.className).not.toMatch(/--accent/);
    expect(add.className).toMatch(/--accent/);
  });

  it('states what the agents footer cell actually does — connection switching, not a settings jump', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        connections={[{ id: 'c1', label: 'local', url: 'http://x', status: 'ready' }]}
        onSwitchConnection={vi.fn()}
      />,
    );
    const cell = screen.getByTestId('rail-connections');
    expect(cell).toHaveAttribute('title', expect.stringMatching(/switch/i));
  });

  // P5-7 (gact-tui#350): New(+) gets an active state while the dialog it
  // opens is up — aria-pressed plus the same accent-modifier convention the
  // button already carries, not a bespoke look.
  it('New carries aria-pressed=false and no active modifier while the dialog is closed', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        onNewSession={vi.fn()}
        newDialogOpen={false}
      />,
    );
    const add = screen.getByRole('button', { name: 'New session' });
    expect(add).toHaveAttribute('aria-pressed', 'false');
    expect(add.className).not.toMatch(/--active/);
  });

  it('New carries aria-pressed=true and the active modifier while newDialogOpen is true', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        onNewSession={vi.fn()}
        newDialogOpen
      />,
    );
    const add = screen.getByRole('button', { name: 'New session' });
    expect(add).toHaveAttribute('aria-pressed', 'true');
    expect(add.className).toMatch(/--active/);
  });

  it('wired end-to-end through SessionView: clicking + pins the button active while the new-session dialog is open', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    await screen.findByText('/scratch/bravo');

    const add = screen.getByRole('button', { name: 'New session' });
    expect(add).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(add);
    await screen.findByRole('dialog', { name: /new/i });
    expect(add).toHaveAttribute('aria-pressed', 'true');
    expect(add.className).toMatch(/--active/);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /new/i })).toBeNull());
    expect(add).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('the rail\'s "open in files" targets the CLICKED workspace', () => {
  it('opens bravo\'s files from its own workspace menu while alpha is the active session', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);

    // alpha becomes the active session first — its workspace must NOT win
    // over an explicit "open in files" request made against bravo below.
    fireEvent.click(screen.getByRole('button', { name: 'alpha run' }));
    await screen.findByText('ready');

    const heads = screen.getAllByTestId(/rail-grouphead-/);
    const bravoHead = heads.find((h) => h.textContent?.includes('bravo'))!;
    fireEvent.click(within(bravoHead).getByRole('button', { name: /workspace menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /open in files/i }));

    const filesDialog = await screen.findByRole('dialog', { name: 'files' });
    expect(filesDialog).toHaveTextContent('/scratch/bravo');
    expect(filesDialog).not.toHaveTextContent('/scratch/alpha');
    await waitFor(() => expect(wire.workspaceFiles).toHaveBeenCalledWith('ws_b', expect.anything()));
  });

  it('the plain topbar files toggle reverts to the active session\'s own workspace afterwards', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'alpha run' }));
    await screen.findByText('ready');

    const heads = screen.getAllByTestId(/rail-grouphead-/);
    const bravoHead = heads.find((h) => h.textContent?.includes('bravo'))!;
    fireEvent.click(within(bravoHead).getByRole('button', { name: /workspace menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /open in files/i }));
    await screen.findByRole('dialog', { name: 'files' });

    // Closed via the topbar's own toggle, then reopened via the topbar's own
    // toggle — this must land back on alpha (the active session), not the
    // stale bravo request from the rail action above.
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const filesDialog = await screen.findByRole('dialog', { name: 'files' });
    await waitFor(() => expect(filesDialog).toHaveTextContent('/scratch/alpha'));
  });
});

describe('search modal workspace rows navigate, like session rows do', () => {
  it('clicking a workspace row opens that workspace\'s files', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    // Workspaces load asynchronously; wait for the real labels to land so the
    // search index has "/scratch/bravo" to match against, not bare ids.
    await screen.findByText('/scratch/bravo');
    fireEvent.click(screen.getByRole('button', { name: /search sessions/i }));
    const dialog = screen.getByRole('dialog', { name: /search/i });
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'bravo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /scratch\/bravo/i }));

    const filesDialog = await screen.findByRole('dialog', { name: 'files' });
    expect(filesDialog).toHaveTextContent('/scratch/bravo');
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
  });
});

describe('topbar hover — cyan text needs the matching background/border tint', () => {
  it('carries background+border on the labeled controls, border-only on the icon-only eye', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/topbar.css'), 'utf8');
    expect(css).toMatch(/\.shell-topbar \.kit-toolbarbutton:hover\s*{[^}]*border-color:\s*var\(--t-cy3\)/s);
    expect(css).toMatch(
      /\.shell-topbar \.kit-toolbarbutton:hover:not\(\[data-icon-only='true'\]\)\s*{[^}]*background:\s*var\(--t-cy12\)/s,
    );
  });
});

/*
 * P5 grind, PASS 2 (2026-08-05). The prototype's `agents`/`relay` footer
 * dots (design/prototype/Clio Session.html, ~offset 7821000) are a plain
 * static `background:var(--t-ok,#34d399)` — no state machine, no pulse. The
 * app had been driving the agents dot through the SESSION-lifecycle
 * `running`/`idle` vocabulary, where `running` renders the busy/in-progress
 * accent (orange), not green — so a real live connection (readyCount > 0)
 * rendered the wrong color entirely, independent of prototype-matching:
 * "running" means "task in progress" everywhere else this dot vocabulary is
 * used, never "backend reachable".
 *
 * Also: every rail hover (workspace group row, session row, the three
 * footer cells) had been reusing the generic `--t-hv` token. The prototype's
 * own style-hover attributes measure `--t-sf2` on all of them, verbatim —
 * `--t-hv` never appears anywhere in the prototype's rail markup. And the
 * icon-only "..." menu buttons (per-session, per-workspace) and "show more"
 * had picked up a background on hover the prototype never gives them
 * (color-only hover there, same as the topbar's icon-only eye).
 */
describe('rail footer "agents" dot uses the static connected/ready color, not the busy accent', () => {
  it('renders "ok" (green, matching var(--t-ok)) when at least one connection is ready', () => {
    const { container } = render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        connections={[{ id: 'c1', label: 'local', url: 'http://x', status: 'ready' }]}
        onSwitchConnection={vi.fn()}
      />,
    );
    const dot = container.querySelector('[data-testid="rail-connections"] .kit-statusdot');
    expect(dot).toHaveAttribute('data-state', 'ok');
  });

  it('falls back to "idle" (never a false-positive green) when nothing is ready', () => {
    const { container } = render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        connections={[{ id: 'c1', label: 'local', url: 'http://x', status: 'refused' }]}
        onSwitchConnection={vi.fn()}
      />,
    );
    const dot = container.querySelector('[data-testid="rail-connections"] .kit-statusdot');
    expect(dot).toHaveAttribute('data-state', 'idle');
  });
});

describe('rail hover tokens match the prototype\'s measured --t-sf2, not the generic --t-hv', () => {
  it('workspace group row, session row, and the footer band all hover on var(--t-sf2)', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/rail.css'), 'utf8');
    expect(css).toMatch(/\.shell-rail__grouphead:hover\s*{[^}]*background:\s*var\(--t-sf2\)/s);
    expect(css).toMatch(
      /\.shell-rail__session:hover\s*{[^}]*background:\s*var\(--t-sf2\)[^}]*border-color:\s*var\(--t-bd3\)/s,
    );
    expect(css).toMatch(
      /\.shell-rail__footcell:hover:not\(:disabled\)\s*{[^}]*background:\s*var\(--t-sf2\)/s,
    );
    // The rail section of the prototype never uses --t-hv at all.
    expect(css).not.toMatch(/\.shell-rail__(grouphead|session|footcell):hover[^}]*var\(--t-hv\)/s);
  });

  it('the per-row "..." menus and "show more" hover color-only — no background the prototype never gives them', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/rail.css'), 'utf8');
    const menuRule = css.match(/\.shell-rail__menu:hover\s*{([^}]*)}/s)?.[1] ?? '';
    const groupMenuRule = css.match(/\.shell-rail__groupmenu:hover\s*{([^}]*)}/s)?.[1] ?? '';
    const showMoreRule = css.match(/\.shell-rail__showmore:hover\s*{([^}]*)}/s)?.[1] ?? '';
    for (const rule of [menuRule, groupMenuRule, showMoreRule]) {
      expect(rule).toMatch(/color:\s*var\(--t-hd\)/);
      expect(rule).not.toMatch(/background/);
    }
  });
});

describe('topbar title + blueprint crumb carry the prototype\'s click-to-rename/navigate hover cues', () => {
  it('the blueprint crumb turns cyan AND fills on hover, not the neutral --t-hv', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/topbar.css'), 'utf8');
    expect(css).toMatch(
      /\.shell-topbar__crumb-button:hover\s*{[^}]*background:\s*var\(--t-sf2\)[^}]*color:\s*var\(--t-cy\)/s,
    );
  });

  it('the session title shows a var(--t-sf2) fill on hover — the click-to-rename affordance the app otherwise gives no visual hint of', () => {
    const css = readFileSync(resolve(__dirname, '../../src/kit/inlineedit.css'), 'utf8');
    expect(css).toMatch(
      /\[data-size='title'\] \.kit-inlineedit__value:hover\s*{[^}]*background:\s*var\(--t-sf2\)/s,
    );
  });

  it('"Show sessions" (rail-collapsed state) keeps its own permanent border, distinct from every other borderless toolbar button', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/topbar.css'), 'utf8');
    expect(css).toMatch(
      /\[aria-label='Show sessions'\]\s*{[^}]*border-color:\s*var\(--t-bd3\)/s,
    );
    expect(css).toMatch(
      /\[aria-label='Show sessions'\]:hover\s*{[^}]*border-color:\s*var\(--t-bd6\)/s,
    );
  });
});

/**
 * P5 grind, PASS 3. Re-verifying every non-"match" item found the relay
 * footer cell already wired (a cross-surface commit, menus-grammar pass 3,
 * touched Rail.tsx directly — see docs/p5/conformance/rail-and-topbar.json's
 * updated status). Sweeping the surface for gaps of the SAME CLASS PASS 2
 * fixed elsewhere (hover-token drift, wrong colour tokens at rest) turned up
 * two real ones PASS 2's sweep had missed because they live in a different
 * file (session/owner-surfaces.css, not shell/rail.css or shell/topbar.css):
 * the search modal's session rows used the `ask` (question-mark) icon
 * instead of the prototype's own chat-bubble glyph, and the row's text used
 * the wrong colour tokens (bodytext var(--t-tx) for the label, and the whole
 * workspace row dimmed to var(--t-mu)) plus an invented cyan hover-colour
 * change the prototype's own style-hover never has (background-only).
 */
describe('search modal session rows carry the prototype\'s chat-bubble icon, not `ask`\'s question mark', () => {
  it('a session row renders the chat icon; a workspace row keeps the folder icon', () => {
    render(
      <SearchDialog
        open
        sessions={SESSIONS}
        workspaces={WORKSPACES}
        onChooseSession={vi.fn()}
        onChooseWorkspace={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const sessionRow = screen.getByRole('button', { name: 'alpha run' });
    expect(sessionRow.querySelector('svg[data-icon]')).toHaveAttribute('data-icon', 'chat');
    expect(sessionRow.querySelector('svg[data-icon="ask"]')).toBeNull();

    // Workspace rows only render once the query is non-empty (they match on
    // the workspace path/name, unlike session rows which show unfiltered).
    fireEvent.change(screen.getByRole('searchbox', { name: /search sessions and workspaces/i }), {
      target: { value: 'alpha' },
    });
    const workspaceRow = screen.getByRole('button', { name: /\/scratch\/alpha/ });
    expect(workspaceRow.querySelector('svg[data-icon]')).toHaveAttribute('data-icon', 'folder');
  });
});

describe('search modal row colours match the prototype\'s measured tokens (session/owner-surfaces.css)', () => {
  it('the row label sits at var(--t-hd) for BOTH row kinds — the prototype shares one label span after its workspace/session icon branches', () => {
    const css = readFileSync(resolve(__dirname, '../../src/session/owner-surfaces.css'), 'utf8');
    expect(css).toMatch(/\.session-search__row\s*{[^}]*color:\s*var\(--t-hd\)/s);
    // The workspace variant no longer dims the whole row (was var(--t-mu));
    // only its spacing is variant-specific now.
    const workspaceRule = css.match(/\.session-search__row\[data-kind='workspace'\]\s*{([^}]*)}/s)?.[1] ?? '';
    expect(workspaceRule).not.toMatch(/color/);
  });

  it('the row icon is muted (var(--t-mu)), distinct from the bright label', () => {
    const css = readFileSync(resolve(__dirname, '../../src/session/owner-surfaces.css'), 'utf8');
    expect(css).toMatch(/\.session-search__row svg\s*{[^}]*color:\s*var\(--t-mu\)/s);
  });

  it('hover is background-only (var(--t-sf2)) — the prototype\'s own style-hover on this row never changes colour', () => {
    const css = readFileSync(resolve(__dirname, '../../src/session/owner-surfaces.css'), 'utf8');
    const hoverRule =
      css.match(/button\.session-search__row:hover,\s*button\.session-search__row:focus-visible\s*{([^}]*)}/s)?.[1] ??
      '';
    expect(hoverRule).toMatch(/background:\s*var\(--t-sf2\)/);
    expect(hoverRule).not.toMatch(/color/);
  });
});

describe('rail footer "relay" cell — re-verified live-wired (fixed cross-surface by menus-grammar pass 3, commit 835546f0)', () => {
  it('is no longer the permanently-disabled dead control the PASS 1/2 notes described', () => {
    render(
      <Rail
        groups={[]}
        activeSessionId={null}
        onSelectSession={vi.fn()}
        onCollapse={vi.fn()}
        relayStatus={{ configured: true, reachable: true, host: 'ares.example.com' }}
        onOpenSettings={vi.fn()}
      />,
    );
    const cell = screen.getByTestId('rail-relay');
    expect(cell).not.toBeDisabled();
    expect(cell).toHaveAttribute('title', expect.stringMatching(/reachable/i));
  });
});
