import { describe, expect, it } from 'vitest';
import type { Workspace } from '@clio/core';
import {
  buildCreateWorkspaceInput,
  createdWorkspaceToastBody,
  filterWorkspaces,
  unregisterWorkspacePrompt,
} from '../../src/routes/discovery/WorkspacesPageModel.js';

const WORKSPACES: Workspace[] = [
  { id: 'ws_alpha', name: 'Alpha Workspace', root_path: '/work/alpha' },
  { id: 'ws_beta', name: 'Beta Project', root_path: '/scratch/beta' },
  { id: 'ws_gamma', name: 'Gamma', root_path: '/data/experiments' },
];

describe('WorkspacesPageModel', () => {
  it('filters workspaces by id, name, and root path', () => {
    expect(filterWorkspaces(WORKSPACES, '').map((w) => w.id)).toEqual([
      'ws_alpha',
      'ws_beta',
      'ws_gamma',
    ]);
    expect(filterWorkspaces(WORKSPACES, 'alpha').map((w) => w.id)).toEqual(['ws_alpha']);
    expect(filterWorkspaces(WORKSPACES, 'PROJECT').map((w) => w.id)).toEqual(['ws_beta']);
    expect(filterWorkspaces(WORKSPACES, 'experiments').map((w) => w.id)).toEqual(['ws_gamma']);
  });

  it('builds a trimmed create-workspace payload', () => {
    expect(buildCreateWorkspaceInput(' /work/new ', ' New Workspace ')).toEqual({
      root_path: '/work/new',
      name: 'New Workspace',
    });
    expect(buildCreateWorkspaceInput('/work/new', '   ')).toEqual({
      root_path: '/work/new',
    });
    expect(buildCreateWorkspaceInput('   ', 'No root')).toBeNull();
  });

  it('builds workspace action copy from stable fields', () => {
    expect(createdWorkspaceToastBody({ id: 'ws_new', name: 'New Workspace' })).toBe(
      'New Workspace',
    );
    expect(createdWorkspaceToastBody({ id: 'ws_new', name: '' })).toBe('');
    expect(unregisterWorkspacePrompt('Alpha Workspace')).toBe(
      'Unregister workspace "Alpha Workspace"? Backend keeps on-disk files; only metadata is dropped.',
    );
  });
});
