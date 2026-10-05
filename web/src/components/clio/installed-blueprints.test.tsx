import type { AgentBlueprint, AgentBlueprintSource } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { InstalledBlueprints } from './installed-blueprints';

afterEach(cleanup);
const source = { id: 'lab', name: 'Research lab', source: '/lab' } as AgentBlueprintSource;
const blueprint = (id: string, enabled: boolean, date: string): AgentBlueprint => ({
  id,
  display_name: id,
  title: id,
  version: '1.0',
  scope: 'global',
  enabled,
  validation_errors: enabled ? [] : ['Missing service'],
  kind: 'blueprint',
  source_id: 'lab',
  description: `${id} research assistant`,
  metadata: { install: { installed_at: date } },
});

it('groups, sorts and filters installed blueprints while keeping details one click away', async () => {
  const user = userEvent.setup();
  const details = vi.fn();
  const clear = vi.fn();
  const alpha = blueprint('Alpha', true, '2026-01-01');
  const zulu = blueprint('Zulu', false, '2026-10-01');
  render(
    <InstalledBlueprints
      blueprints={[zulu, alpha]}
      sources={[source]}
      search=""
      loading={false}
      onDetails={details}
      onClearSearch={clear}
      onReload={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  const group = screen.getByRole('region', { name: 'Research lab' });
  expect(screen.queryByRole('combobox', { name: 'Filter by marketplace' })).not.toBeInTheDocument();
  expect(within(group).getAllByRole('article')[0]).toHaveTextContent('Alpha');
  await user.click(screen.getByRole('button', { name: 'Details for Alpha' }));
  expect(details).toHaveBeenCalledWith(alpha);
  await user.click(screen.getByRole('combobox', { name: 'Sort blueprints' }));
  await user.click(screen.getByRole('option', { name: 'Recently installed' }));
  expect(within(group).getAllByRole('article')[0]).toHaveTextContent('Zulu');
  await user.click(screen.getByRole('combobox', { name: 'Filter by status' }));
  await user.click(screen.getByRole('option', { name: 'Needs attention' }));
  expect(screen.queryByRole('button', { name: 'Details for Alpha' })).not.toBeInTheDocument();
  expect(screen.getByText('1 of 2 installed blueprints')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(clear).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Details for Alpha' })).toBeVisible();
});

it('can filter by marketplace and searches full descriptions without changing the data', async () => {
  const user = userEvent.setup();
  const a = blueprint('Alpha', true, '2026-01-01');
  const b = { ...blueprint('Beta', true, '2026-01-01'), source_id: 'other' };
  render(
    <InstalledBlueprints
      blueprints={[a, b]}
      sources={[source]}
      search="research assistant"
      loading={false}
      onDetails={vi.fn()}
      onClearSearch={vi.fn()}
      onReload={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('combobox', { name: 'Filter by marketplace' }));
  await user.click(screen.getByRole('option', { name: 'Research lab' }));
  expect(screen.getByRole('button', { name: 'Details for Alpha' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Details for Beta' })).not.toBeInTheDocument();
});

it('clears a removed marketplace filter instead of hiding the remaining installations', async () => {
  const user = userEvent.setup();
  const a = blueprint('Alpha', true, '2026-01-01');
  const b = { ...blueprint('Beta', true, '2026-01-01'), source_id: 'other' };
  const props = {
    sources: [source],
    search: '',
    loading: false,
    onDetails: vi.fn(),
    onClearSearch: vi.fn(),
    onReload: vi.fn(),
    onRemove: vi.fn(),
  };
  const view = render(<InstalledBlueprints {...props} blueprints={[a, b]} />);
  await user.click(screen.getByRole('combobox', { name: 'Filter by marketplace' }));
  await user.click(screen.getByRole('option', { name: 'Research lab' }));
  view.rerender(<InstalledBlueprints {...props} blueprints={[b]} />);
  expect(screen.getByRole('button', { name: 'Details for Beta' })).toBeVisible();
  expect(screen.queryByRole('combobox', { name: 'Filter by marketplace' })).not.toBeInTheDocument();
});
