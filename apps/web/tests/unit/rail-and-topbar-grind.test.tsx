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
