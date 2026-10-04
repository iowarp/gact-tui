import type { AgentBlueprintSource, Workspace } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSourceDialog } from './marketplace-source-dialog';
import { vocab } from '@/lib/brand-vocabulary';

vi.mock('./host-path-picker', () => ({
  HostPathPicker: ({
    targetId,
    hostLabel,
    label,
    onChoose,
  }: {
    targetId: string;
    hostLabel: string;
    label: string;
    onChoose: (path: string) => void;
  }) => (
    <button
      aria-label={`Browse ${label} on ${hostLabel}`}
      data-target={targetId}
      onClick={() => onChoose('/work/science/marketplace')}
    >
      Browse
    </button>
  ),
}));
const workspace: Workspace = {
  id: 'ws_science',
  name: 'science',
  display_name: 'Science workspace',
  path: '/work/science',
  connection_id: 'conn_local',
  pinned: false,
};
const source: AgentBlueprintSource = {
  id: 'src_fixture',
  name: 'Science',
  source: 'https://github.com/example/science',
  ref: 'main',
  pinned_commit: 'a'.repeat(40),
  status: 'ready',
  available_blueprints: [],
  install_scope: 'global',
  working_checkout: '/work/science/checkout',
  updated_at: 'revision-1',
};
afterEach(cleanup);

describe('MarketplaceSourceDialog', () => {
  it('browses the connected host and submits a workspace-scoped folder', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <MarketplaceSourceDialog
        hostLabel="Delta"
        onAdd={onAdd}
        onOpenChange={vi.fn()}
        open
        pending={false}
        workspaces={[workspace]}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Source type' }));
    await user.click(screen.getByRole('option', { name: `Folder on ${vocab.agent}` }));
    const browse = screen.getByRole('button', { name: 'Browse Marketplace folder on Delta' });
    expect(browse).toHaveAttribute('data-target', 'local');
    await user.click(browse);
    await user.click(screen.getByRole('combobox', { name: 'Available in' }));
    await user.click(screen.getByRole('option', { name: 'Science workspace' }));
    await user.click(screen.getByRole('button', { name: 'Add marketplace' }));
    expect(onAdd).toHaveBeenCalledWith({
      name: '/work/science/marketplace',
      source: '/work/science/marketplace',
      ref: '',
      pinned_commit: '',
      working_checkout: '',
      scope: 'workspace',
      workspace_id: 'ws_science',
    });
  });

  it('retains the existing pin and checkout while saving a changed branch', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <MarketplaceSourceDialog
        hostLabel="Delta"
        initial={source}
        onAdd={onAdd}
        onOpenChange={vi.fn()}
        open
        pending={false}
        workspaces={[workspace]}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Available in' })).toBeDisabled();
    await user.clear(screen.getByRole('textbox', { name: 'Branch or tag' }));
    await user.type(screen.getByRole('textbox', { name: 'Branch or tag' }), 'beta3');
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'beta3',
        pinned_commit: 'a'.repeat(40),
        working_checkout: '/work/science/checkout',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
  });

  it('allows explicit unpinning but refuses a truncated hash', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <MarketplaceSourceDialog
        hostLabel="Delta"
        initial={source}
        onAdd={onAdd}
        onOpenChange={vi.fn()}
        open
        pending={false}
        workspaces={[workspace]}
      />,
    );
    const pin = screen.getByRole('textbox', { name: 'Pinned commit' });
    await user.clear(pin);
    await user.type(pin, 'abc123');
    expect(screen.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
    await user.clear(pin);
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ pinned_commit: '' }));
  });

  it('keeps unsaved values visible when another client edits the registration', () => {
    render(
      <MarketplaceSourceDialog
        hostLabel="Delta"
        initial={source}
        error="Marketplace changed; review and retry"
        onAdd={vi.fn()}
        onOpenChange={vi.fn()}
        open
        pending={false}
        workspaces={[workspace]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Marketplace changed');
    expect(screen.getByRole('textbox', { name: 'Pinned commit' })).toHaveValue(
      source.pinned_commit,
    );
  });
});
