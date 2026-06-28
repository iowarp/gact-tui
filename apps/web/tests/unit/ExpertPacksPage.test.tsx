import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { ExpertPacksPage } from '../../src/routes/discovery/RoadmapPages.js';

afterEach(cleanup);

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}) {
  const expertPacks = vi.fn().mockResolvedValue({
    packs: [
      {
        id: 'toolkit',
        name: 'Toolkit Pack',
        description: 'Reusable workflow experts',
        kind: 'pack',
        scope: 'workspace',
        runtime_scope: 'active',
      },
    ],
  });
  const installExpertPack = vi.fn().mockResolvedValue({ installed: [] });
  const validateExpertPack = vi
    .fn()
    .mockResolvedValue({ ok: true, errors: [], metadata: {} });
  const updateExpertPack = vi.fn().mockResolvedValue({ updated: [] });
  const deleteExpertPack = vi.fn().mockResolvedValue(undefined);
  const client = {
    expertPacks,
    installExpertPack,
    validateExpertPack,
    updateExpertPack,
    deleteExpertPack,
    ...overrides,
  } as unknown as Client;
  return {
    client,
    expertPacks,
    installExpertPack,
    validateExpertPack,
    updateExpertPack,
    deleteExpertPack,
  };
}

async function waitForPack() {
  await waitFor(() => expect(screen.queryByTestId('expertpack-toolkit')).toBeTruthy());
}

describe('ExpertPacksPage lifecycle', () => {
  it('renders pack kind/scope metadata from the 0.5.3 catalog rows', async () => {
    const { client } = makeClient();
    render(() => <ExpertPacksPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForPack();

    const row = screen.getByTestId('expertpack-toolkit');
    expect(row.textContent).toContain('Toolkit Pack');
    expect(row.textContent).toContain('pack');
    expect(row.textContent).toContain('workspace');
    expect(row.textContent).toContain('active');
  });

  it('installs from the entered source using workspace scope when a workspace is active', async () => {
    const { client, installExpertPack, expertPacks } = makeClient();
    render(() => <ExpertPacksPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForPack();

    fireEvent.click(screen.getByTestId('expertpack-validate-toggle'));
    const scope = screen.getByTestId('expertpack-validate-scope') as HTMLSelectElement;
    expect(scope.value).toBe('workspace');
    fireEvent.input(screen.getByTestId('expertpack-validate-input'), {
      target: { value: '/tmp/pack-source' },
    });
    fireEvent.click(screen.getByTestId('expertpack-install-submit'));

    await waitFor(() =>
      expect(installExpertPack).toHaveBeenCalledWith({
        source: '/tmp/pack-source',
        scope: 'workspace',
        workspace_id: 'ws_123',
      }),
    );
    await waitFor(() => expect(screen.getByTestId('expertpack-verdict').textContent).toContain('Installed'));
    await waitFor(() => expect(expertPacks).toHaveBeenCalledTimes(2));
  });

  it('falls back to global install scope when there is no workspace context', async () => {
    const { client, installExpertPack } = makeClient();
    render(() => <ExpertPacksPage client={client} />);
    await waitForPack();

    fireEvent.click(screen.getByTestId('expertpack-validate-toggle'));
    const scope = screen.getByTestId('expertpack-validate-scope') as HTMLSelectElement;
    expect(scope.value).toBe('global');
    fireEvent.input(screen.getByTestId('expertpack-validate-input'), {
      target: { value: 'https://example.test/pack.git' },
    });
    fireEvent.click(screen.getByTestId('expertpack-install-submit'));

    await waitFor(() =>
      expect(installExpertPack).toHaveBeenCalledWith({
        source: 'https://example.test/pack.git',
        scope: 'global',
      }),
    );
  });

  it('validates the entered source with the selected lifecycle scope', async () => {
    const { client, validateExpertPack } = makeClient();
    render(() => <ExpertPacksPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForPack();

    fireEvent.click(screen.getByTestId('expertpack-validate-toggle'));
    fireEvent.change(screen.getByTestId('expertpack-validate-scope'), {
      target: { value: 'global' },
    });
    fireEvent.input(screen.getByTestId('expertpack-validate-input'), {
      target: { value: '/tmp/pack-source' },
    });
    fireEvent.click(screen.getByTestId('expertpack-validate-submit'));

    await waitFor(() =>
      expect(validateExpertPack).toHaveBeenCalledWith({
        path: '/tmp/pack-source',
        scope: 'global',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('expertpack-verdict').textContent).toContain('validates'),
    );
  });

  it('updates and deletes packs with workspace scope and refetches', async () => {
    const { client, updateExpertPack, deleteExpertPack, expertPacks } = makeClient();
    render(() => <ExpertPacksPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForPack();

    fireEvent.click(screen.getByTestId('expertpack-update-toolkit'));
    await waitFor(() =>
      expect(updateExpertPack).toHaveBeenCalledWith('toolkit', {
        scope: 'workspace',
        workspace_id: 'ws_123',
      }),
    );
    await waitFor(() => expect(screen.getByTestId('expertpack-verdict').textContent).toContain('Updated toolkit'));
    await waitFor(() =>
      expect((screen.getByTestId('expertpack-delete-toolkit') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('expertpack-delete-toolkit'));
    await waitFor(() =>
      expect(deleteExpertPack).toHaveBeenCalledWith('toolkit', {
        scope: 'workspace',
        workspace_id: 'ws_123',
      }),
    );
    await waitFor(() => expect(screen.getByTestId('expertpack-verdict').textContent).toContain('Deleted toolkit'));
    await waitFor(() => expect(expertPacks).toHaveBeenCalledTimes(3));
  });

  it('reports lifecycle action failures without refetching', async () => {
    const failingUpdate = vi.fn().mockRejectedValue(new Error('update failed'));
    const { client, expertPacks } = makeClient({
      updateExpertPack: failingUpdate,
    });
    render(() => <ExpertPacksPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await waitForPack();

    fireEvent.click(screen.getByTestId('expertpack-update-toolkit'));

    await waitFor(() => expect(failingUpdate).toHaveBeenCalledWith('toolkit', {
      scope: 'workspace',
      workspace_id: 'ws_123',
    }));
    await waitFor(() =>
      expect(screen.getByTestId('expertpack-error').textContent).toContain('update failed'),
    );
    expect(screen.queryByTestId('expertpack-verdict')).toBeNull();
    expect(expertPacks).toHaveBeenCalledTimes(1);
  });
});
