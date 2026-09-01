import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  workspaces: vi.fn(),
  expertPacks: vi.fn(),
  expertPack: vi.fn(),
  agentBlueprintSources: vi.fn(),
  installExpertPack: vi.fn(),
  updateExpertPack: vi.fn(),
  deleteExpertPack: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { ExpertPackSettings } from './settings-expert-packs';

function renderSettings(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const servicePack = {
  id: 'earth-data',
  version: '1.2.0',
  title: 'Earth data experts',
  description: 'Coordinates grounded data discovery.',
  scope: 'global',
  enabled: true,
  validation_errors: [],
  kind: 'pack' as const,
  defaults: {},
  metadata: { lifecycle: 'service' },
};

beforeEach(() => {
  repository.workspaces.mockResolvedValue([]);
  repository.expertPacks.mockResolvedValue([]);
  repository.expertPack.mockResolvedValue({ expert_pack: servicePack, agents: [] });
  repository.agentBlueprintSources.mockResolvedValue([]);
  repository.installExpertPack.mockResolvedValue({});
  repository.updateExpertPack.mockResolvedValue({});
  repository.deleteExpertPack.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('expert pack settings', () => {
  it('states honestly when neither installed nor marketplace packs exist', async () => {
    renderSettings(<ExpertPackSettings />);

    expect(await screen.findByText('No expert packs are installed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage marketplaces' })).toHaveAttribute(
      'href',
      '/settings/blueprints',
    );
    expect(screen.getByText(/report no expert packs/i)).toBeInTheDocument();
  });

  it('shows service-managed lifecycle actions and pack agent details', async () => {
    const user = userEvent.setup();
    repository.expertPacks.mockResolvedValue([servicePack]);
    repository.expertPack.mockResolvedValue({
      expert_pack: servicePack,
      agents: [
        {
          id: 'catalog-reviewer',
          title: 'Catalog reviewer',
          description: 'Checks source evidence.',
          source: 'expert_pack',
          enabled: true,
          validation_errors: [],
        },
      ],
    });
    renderSettings(<ExpertPackSettings />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Earth data experts' }));
    expect(screen.getByRole('menuitem', { name: 'Check for update' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'View experts' }));
    expect(await screen.findByText('Catalog reviewer')).toBeVisible();
    expect(screen.getByText('Checks source evidence.')).toBeVisible();
  });

  it('installs a validated marketplace pack through the pack-specific action', async () => {
    const user = userEvent.setup();
    repository.agentBlueprintSources.mockResolvedValue([
      {
        id: 'science-market',
        name: 'Science marketplace',
        source: 'https://example.test/science.git',
        status: 'ready',
        available_blueprints: [
          {
            id: 'earth-data',
            title: 'Earth data experts',
            version: '1.2.0',
            kind: 'pack',
            enabled: true,
            validation_errors: [],
          },
        ],
      },
    ]);
    renderSettings(<ExpertPackSettings />);

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    expect(repository.installExpertPack).toHaveBeenCalledWith({
      source_id: 'science-market',
      pack_id: 'earth-data',
      scope: 'global',
      workspace_id: undefined,
    });
  });
});
