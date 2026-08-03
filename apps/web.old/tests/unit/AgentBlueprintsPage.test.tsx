import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { BlueprintsPage } from '../../src/routes/discovery/RoadmapPages.js';

afterEach(cleanup);

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}) {
  const agentBlueprints = vi.fn().mockResolvedValue({
    blueprints: [
      {
        id: 'workflow-live',
        name: 'Workflow Live',
        description: 'A workspace workflow',
        kind: 'blueprint',
        scope: 'workspace',
      },
    ],
  });
  const blueprintSources = vi.fn().mockResolvedValue({ sources: [] });
  const validateAgentBlueprint = vi
    .fn()
    .mockResolvedValue({ ok: true, errors: [], raw: {} });
  const installAgentBlueprint = vi.fn().mockResolvedValue({ installed: [] });
  const uninstallAgentBlueprint = vi.fn().mockResolvedValue(undefined);
  const client = {
    agentBlueprints,
    blueprintSources,
    validateAgentBlueprint,
    installAgentBlueprint,
    uninstallAgentBlueprint,
    ...overrides,
  } as unknown as Client;
  return {
    client,
    agentBlueprints,
    validateAgentBlueprint,
    installAgentBlueprint,
    uninstallAgentBlueprint,
  };
}

async function waitForBlueprint() {
  await waitFor(() => expect(screen.queryByTestId('blueprint-workflow-live')).toBeTruthy());
}

describe('BlueprintsPage lifecycle', () => {
  it('lists blueprints using active workspace context', async () => {
    const { client, agentBlueprints } = makeClient();
    render(() => <BlueprintsPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForBlueprint();

    expect(agentBlueprints).toHaveBeenCalledWith({ workspace_id: 'ws_123' });
    expect(screen.getByTestId('blueprint-workflow-live').textContent).toContain('Workflow Live');
  });

  it('validates and installs local sources with workspace scope', async () => {
    const { client, validateAgentBlueprint, installAgentBlueprint } = makeClient();
    render(() => <BlueprintsPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForBlueprint();

    fireEvent.click(screen.getByTestId('blueprint-manual-install-toggle'));
    const scope = screen.getByTestId('blueprint-install-scope') as HTMLSelectElement;
    expect(scope.value).toBe('workspace');
    fireEvent.input(screen.getByTestId('blueprint-install-input'), {
      target: { value: '/tmp/workflow-source' },
    });
    fireEvent.click(screen.getByTestId('blueprint-install-submit'));

    await waitFor(() =>
      expect(validateAgentBlueprint).toHaveBeenCalledWith({
        path: '/tmp/workflow-source',
        scope: 'workspace',
        workspace_id: 'ws_123',
      }),
    );
    await waitFor(() =>
      expect(installAgentBlueprint).toHaveBeenCalledWith({
        source: '/tmp/workflow-source',
        scope: 'workspace',
        workspace_id: 'ws_123',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-verdict').textContent).toContain('Installed'),
    );
  });

  it('falls back to global install scope without workspace context', async () => {
    const { client, installAgentBlueprint } = makeClient();
    render(() => <BlueprintsPage client={client} />);
    await waitForBlueprint();

    fireEvent.click(screen.getByTestId('blueprint-manual-install-toggle'));
    const scope = screen.getByTestId('blueprint-install-scope') as HTMLSelectElement;
    expect(scope.value).toBe('global');
    fireEvent.input(screen.getByTestId('blueprint-install-input'), {
      target: { value: 'https://example.test/workflow.git' },
    });
    fireEvent.click(screen.getByTestId('blueprint-install-submit'));

    await waitFor(() =>
      expect(installAgentBlueprint).toHaveBeenCalledWith({
        source: 'https://example.test/workflow.git',
        scope: 'global',
      }),
    );
  });

  it('uninstalls workspace blueprints with explicit workspace scope', async () => {
    const { client, uninstallAgentBlueprint } = makeClient();
    render(() => <BlueprintsPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForBlueprint();

    fireEvent.click(screen.getByTestId('blueprint-uninstall-workflow-live'));

    await waitFor(() =>
      expect(uninstallAgentBlueprint).toHaveBeenCalledWith('workflow-live', {
        scope: 'workspace',
        workspace_id: 'ws_123',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-verdict').textContent).toContain(
        'Uninstalled Workflow Live',
      ),
    );
  });
});
