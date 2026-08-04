/**
 * Slice C contract — topbar conformance, CORRECTED to the owner's semantics
 * (COMMENTS.md 2026-08-04). Two of the original readings were wrong and are
 * reversed here:
 *
 * - Console is DESKTOP-ONLY and reads exactly "console". (The first contract
 *   un-gated it because the prototype renders it in a plain browser — the
 *   prototype simply does not encode the gate.)
 * - The crumb after the session title names the session's BLUEPRINT
 *   (`active_agent_blueprint_id` — the prototype's `earthscope-gnss-region`
 *   is a pack id, not a workspace path). Clicking it opens the blueprint
 *   window (view; edit is clio-agent#1178 and ships visibly degraded).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Topbar } from '../../src/shell/Topbar';
import { SessionView } from '../../src/session/SessionView';

describe('Topbar (C2/C3)', () => {
  function renderTopbar(extra: Partial<Parameters<typeof Topbar>[0]> = {}) {
    return render(
      <Topbar title="a session" railCollapsed={false} onShowRail={vi.fn()} {...extra} />,
    );
  }

  afterEach(() => {
    delete (window as { isTauri?: boolean }).isTauri;
  });

  it('offers no console in the browser — desktop-only, labeled exactly "console"', () => {
    renderTopbar();
    expect(screen.queryByRole('button', { name: /console/i })).toBeNull();
  });

  it('offers the console on desktop, named "console" not "Workspace console"', () => {
    (window as { isTauri?: boolean }).isTauri = true;
    renderTopbar();
    const console_ = screen.getByRole('button', { name: /console/i });
    expect(console_).toHaveAccessibleName(expect.stringMatching(/^console$/i));
  });

  it('carries the artifact count as its own span for accent styling', () => {
    const { container } = renderTopbar({ artifactCount: 5 });
    const count = container.querySelector('.shell-topbar__count');
    expect(count?.textContent).toBe('5');
  });
});

describe('blueprint crumb (C1, corrected)', () => {
  const SESSIONS = [
    { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_a' },
  ] as unknown as Session[];
  const MESSAGES: Message[] = [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
  ] as unknown as Message[];

  function makeClient() {
    return {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      getSession: vi.fn(async () => ({
        id: 'sess_a',
        workspace_id: 'ws_a',
        approval_mode: 'ask',
        metadata: {
          active_agent_blueprint_id: 'earthscope-gnss-region',
          active_agent_blueprint_name: 'EarthScope',
          active_agent_blueprint_version: '0.1.0',
        },
      })),
      get: vi.fn(async (path: string) => {
        if (path.includes('/agent-blueprints/')) {
          return {
            agent_blueprint: {
              id: 'earthscope-gnss-region',
              title: 'EarthScope GNSS Region',
              version: '0.1.0',
              description: 'demo blueprint',
            },
            agents: [],
            mcp_descriptors: [],
          };
        }
        return { tasks: [], used_pct: null, pct_used: 0 };
      }),
    } as unknown as Client;
  }

  it('names the session blueprint, never a workspace id or path', async () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument());
    const crumb = screen.getByRole('banner').querySelector('.shell-topbar__crumb');
    await waitFor(() => expect(crumb?.textContent).toBe('earthscope-gnss-region'));
  });

  it('opens the blueprint window on click — view backed, edit visibly degraded (#1178)', async () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() =>
      expect(screen.getByRole('banner').querySelector('.shell-topbar__crumb')?.textContent).toBe(
        'earthscope-gnss-region',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /earthscope-gnss-region/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('EarthScope GNSS Region');
    // The definition body has no wire surface yet — the gap is VISIBLE.
    expect(dialog.textContent).toMatch(/definition|#1178/i);
  });
});
