import type { AgentBlueprintReference, Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { isSessionActive, isSessionRunning, showsBaseAgent } from './session-state';

describe('session state semantics', () => {
  it('keeps response blockers active without presenting them as working', () => {
    expect(isSessionRunning('waiting_permission')).toBe(false);
    expect(isSessionRunning('waiting_user')).toBe(false);
    expect(isSessionActive('waiting_permission')).toBe(true);
    expect(isSessionActive('waiting_user')).toBe(true);
  });
});

describe('showsBaseAgent', () => {
  const rootSession: Session = {
    id: 'sess_root',
    workspace_id: 'ws_demo',
    title: 'NDP demo',
    state: 'completed',
    created_at: '2026-08-24T00:00:00Z',
    updated_at: '2026-08-24T00:00:00Z',
    mode: 'edit',
    edit_mode: 'diff',
    routing_mode: 'auto',
    approval_mode: 'ask',
    pinned: false,
    archived: false,
  };
  const blueprint: AgentBlueprintReference = {
    id: 'earthscope-flat',
    display_name: 'EarthScope (Flat / Haiku)',
  };

  it('is true for a top-level session on the unblueprinted main agent', () => {
    expect(showsBaseAgent(rootSession, undefined)).toBe(true);
    expect(showsBaseAgent({ ...rootSession, agent_id: 'main' }, undefined)).toBe(true);
  });

  it('is false once a blueprint is active', () => {
    expect(showsBaseAgent(rootSession, blueprint)).toBe(false);
  });

  it('is false for a child session, a non-main agent, or no session at all', () => {
    expect(showsBaseAgent({ ...rootSession, parent_session_id: 'sess_parent' }, undefined)).toBe(
      false,
    );
    expect(showsBaseAgent({ ...rootSession, agent_id: 'data-expert' }, undefined)).toBe(false);
    expect(showsBaseAgent(undefined, undefined)).toBe(false);
  });
});
