import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { WorkspacesPage } from '../../src/routes/discovery/WorkspacesPage.js';

afterEach(cleanup);

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockReturnValue('Renamed Workspace');
});

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}) {
  const workspaces = vi.fn().mockResolvedValue({
    workspaces: [
      {
        id: 'ws_alpha',
        name: 'Alpha Workspace',
        root_path: '/work/alpha',
      },
    ],
  });
  const createWorkspace = vi.fn().mockResolvedValue({
    id: 'ws_beta',
    name: 'Beta Workspace',
    root_path: '/work/beta',
  });
  const patchWorkspace = vi.fn().mockResolvedValue({
    id: 'ws_alpha',
    name: 'Renamed Workspace',
    root_path: '/work/alpha',
  });
  const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
  const workspaceRepoMap = vi.fn().mockResolvedValue({
    tree: { src: { 'index.ts': 'file' } },
    tokens: 42,
  });
  const client = {
    workspaces,
    createWorkspace,
    patchWorkspace,
    deleteWorkspace,
    workspaceRepoMap,
    ...overrides,
  } as unknown as Client;
  return {
    client,
    workspaces,
    createWorkspace,
    patchWorkspace,
    deleteWorkspace,
    workspaceRepoMap,
  };
}

async function waitForWorkspace() {
  await waitFor(() => expect(screen.getByTestId('workspace-card-ws_alpha')).toBeTruthy());
}

describe('WorkspacesPage', () => {
  it('creates a workspace from the inline form', async () => {
    const { client, createWorkspace } = makeClient();
    render(() => <WorkspacesPage client={client} />);
    await waitForWorkspace();

    fireEvent.click(screen.getByTestId('workspaces-new'));
    fireEvent.input(screen.getByTestId('workspaces-root-input'), {
      target: { value: '/work/beta' },
    });
    fireEvent.input(screen.getByTestId('workspaces-name-input'), {
      target: { value: 'Beta Workspace' },
    });
    fireEvent.click(screen.getByTestId('workspaces-submit'));

    await waitFor(() =>
      expect(createWorkspace).toHaveBeenCalledWith({
        root_path: '/work/beta',
        name: 'Beta Workspace',
      }),
    );
  });

  it('renames and unregisters a workspace through card actions', async () => {
    const { client, patchWorkspace, deleteWorkspace } = makeClient();
    render(() => <WorkspacesPage client={client} />);
    await waitForWorkspace();

    fireEvent.click(screen.getByTestId('workspace-rename-ws_alpha'));
    await waitFor(() =>
      expect(patchWorkspace).toHaveBeenCalledWith('ws_alpha', {
        name: 'Renamed Workspace',
      }),
    );
    await waitForWorkspace();

    fireEvent.click(screen.getByTestId('workspace-delete-ws_alpha'));
    await waitFor(() => expect(deleteWorkspace).toHaveBeenCalledWith('ws_alpha'));
  });

  it('lazy-loads a workspace repo map when the card expands', async () => {
    const { client, workspaceRepoMap } = makeClient();
    render(() => <WorkspacesPage client={client} />);
    await waitForWorkspace();

    expect(workspaceRepoMap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('workspace-repo-toggle-ws_alpha'));

    await waitFor(() => expect(workspaceRepoMap).toHaveBeenCalledWith('ws_alpha'));
    await waitFor(() =>
      expect(screen.getByTestId('workspace-card-ws_alpha').textContent).toContain('42t'),
    );
    expect(screen.getByTestId('workspace-card-ws_alpha').textContent).toContain('index.ts');
  });
});
