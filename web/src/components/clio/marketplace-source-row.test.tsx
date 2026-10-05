import type { AgentBlueprintSource } from '@clio/core/v3';
import { agentBlueprintSourceSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketplaceSourceRow } from './marketplace-source-row';

const state = vi.hoisted(() => ({ operation: undefined as object | undefined, pending: false }));
vi.mock('@/hooks/use-blueprint-operation', () => ({ useBlueprintOperation: () => state }));
beforeEach(() => {
  state.operation = undefined;
  state.pending = false;
});
afterEach(cleanup);
const source: AgentBlueprintSource = {
  id: 'src_lab',
  name: 'Lab',
  source: 'https://github.com/example/lab',
  status: 'ready',
  available_blueprints: [
    {
      id: 'demo',
      title: 'Demo',
      description: 'Explore microscopy images',
      version: '2.0',
      kind: 'blueprint',
      enabled: true,
      validation_errors: [],
    },
    { id: 'second', title: 'Weather', kind: 'blueprint', enabled: true, validation_errors: [] },
  ],
};

it('preserves provider descriptions while decoding the catalog', () => {
  expect(agentBlueprintSourceSchema.parse(source).available_blueprints[0].description).toBe(
    'Explore microscopy images',
  );
});

it('browses, searches descriptions and installs through the existing action', async () => {
  const user = userEvent.setup();
  const install = vi.fn();
  const configure = vi.fn();
  const remove = vi.fn();
  const reload = vi.fn();
  const details = vi.fn();
  render(
    <MarketplaceSourceRow
      source={source}
      scopeLabel="All workspaces"
      pending={false}
      isInstalled={(id) => id === 'second'}
      onInstall={install}
      onConfigure={configure}
      onRemove={remove}
      onReload={reload}
      onDetails={details}
    />,
  );
  expect(screen.queryByText('Explore microscopy images')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Browse blueprints (2)' }));
  await user.click(screen.getByRole('button', { name: 'Details for Weather' }));
  expect(details).toHaveBeenCalledWith('second');
  await user.type(screen.getByRole('textbox', { name: 'Search Lab blueprints' }), 'microscopy');
  expect(screen.getByText('Explore microscopy images')).toBeVisible();
  expect(screen.queryByText('Weather')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Install' }));
  expect(install).toHaveBeenCalledWith('demo');
  await user.click(screen.getByRole('button', { name: 'Configure Lab' }));
  await user.click(screen.getByRole('button', { name: 'Remove Lab' }));
  await user.click(screen.getByRole('button', { name: 'Reload' }));
  expect(configure).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});

it('explains missing tools and keeps the full error in collapsed details', async () => {
  const error =
    'blueprint installation failed: Staged blueprint runtime is invalid: operator: unknown tool reference: relay_observe';
  state.operation = {
    id: 'failure',
    label: 'Reload marketplace',
    status: 'failed',
    error,
    installed: [],
    skipped: [],
    target: { source_id: 'src_lab' },
  };
  render(
    <MarketplaceSourceRow
      source={{ ...source, status: 'error', error }}
      scopeLabel="All workspaces"
      pending={false}
      isInstalled={() => true}
      onInstall={vi.fn()}
      onConfigure={vi.fn()}
      onRemove={vi.fn()}
      onReload={vi.fn()}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'A blueprint needs tools that are not available',
  );
  expect(screen.getByText(error)).not.toBeVisible();
  await userEvent.click(screen.getByText('Reload details'));
  expect(screen.getByText(error)).toBeVisible();
});

it('does not label an install as a reload', async () => {
  render(
    <MarketplaceSourceRow
      source={source}
      scopeLabel="All workspaces"
      pending
      installingId="demo"
      isInstalled={() => false}
      onInstall={vi.fn()}
      onConfigure={vi.fn()}
      onRemove={vi.fn()}
      onReload={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Browse blueprints (2)' }));
  expect(screen.getByRole('button', { name: 'Installing…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled();
  expect(screen.queryByText('Reloading…')).not.toBeInTheDocument();
});

it('distinguishes the catalog version from the retained installed version after a failed reload', async () => {
  render(
    <MarketplaceSourceRow
      source={source}
      scopeLabel="Shared"
      pending={false}
      isInstalled={() => true}
      installedVersion={() => '1.0'}
      onInstall={vi.fn()}
      onConfigure={vi.fn()}
      onRemove={vi.fn()}
      onReload={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Browse blueprints (2)' }));
  expect(screen.getByText('Available: v2.0')).toBeVisible();
  expect(screen.getAllByText('Installed v1.0')).toHaveLength(2);
  expect(screen.queryByText('Installed v2.0')).not.toBeInTheDocument();
});
