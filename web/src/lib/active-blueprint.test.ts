import type { AgentBlueprint, Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { resolveActiveBlueprint } from './active-blueprint';

const session: Session = {
  id: 'sess_ndp',
  workspace_id: 'ws_demo',
  title: 'NDP demo',
  state: 'completed',
  created_at: '2026-08-24T00:00:00Z',
  updated_at: '2026-08-24T00:00:00Z',
  active_blueprint_id: 'earthscope-flat',
  active_blueprint_name: 'EarthScope (Flat / Haiku)',
  active_blueprint_version: '0.1.0',
  active_blueprint_scope: 'global',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

describe('resolveActiveBlueprint', () => {
  it('retains the server-owned session activation outside the installed catalog', () => {
    expect(resolveActiveBlueprint(session, [])).toEqual({
      id: 'earthscope-flat',
      display_name: 'EarthScope (Flat / Haiku)',
      version: '0.1.0',
      scope: 'global',
    });
  });

  it('prefers the richer installed catalog record when available', () => {
    const installed: AgentBlueprint = {
      id: 'earthscope-flat',
      version: '0.2.0',
      title: 'EarthScope',
      display_name: 'EarthScope live catalog',
      scope: 'workspace',
      enabled: true,
      validation_errors: [],
      kind: 'blueprint',
      metadata: {},
    };

    expect(resolveActiveBlueprint(session, [installed])).toBe(installed);
  });
});
