/**
 * Slice C failing-first contract — topbar conformance (P5 inventory C1–C3).
 *
 * Ribbon styling (C4) and the eye glyph (C5) are geometry/appearance — the
 * browser audit verifies those; this file pins structure and semantics.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { Topbar } from '../../src/shell/Topbar';
import { SessionView } from '../../src/session/SessionView';

describe('Topbar (C2/C3)', () => {
  function renderTopbar(extra: Partial<Parameters<typeof Topbar>[0]> = {}) {
    return render(
      <Topbar title="a session" railCollapsed={false} onShowRail={vi.fn()} {...extra} />,
    );
  }

  it('offers the workspace console in the browser too', () => {
    // The prototype renders `console` in a plain-browser render; the
    // desktop-only gate recorded earlier was wrong (C2).
    renderTopbar();
    expect(screen.getByRole('button', { name: /console/i })).toBeInTheDocument();
  });

  it('carries the artifact count as its own span for accent styling', () => {
    const { container } = renderTopbar({ artifactCount: 5 });
    const count = container.querySelector('.shell-topbar__count');
    expect(count?.textContent).toBe('5');
  });
});

describe('breadcrumb (C1)', () => {
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
      workspaces: vi.fn(async () => ({
        workspaces: [{ id: 'ws_a', name: 'proj', root_path: 'D:\\Users\\jaime\\proj' }],
      })),
      get: vi.fn(async () => ({ tasks: [], used_pct: null, pct_used: 0 })),
    } as unknown as Client;
  }

  it('names the workspace by its shortened path, never the raw id', async () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument());
    const crumb = screen.getByRole('banner').querySelector('.shell-topbar__crumb');
    await waitFor(() => expect(crumb?.textContent).toBe('~/proj'));
    expect(crumb?.textContent).not.toContain('ws_a');
  });
});
