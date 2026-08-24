import type { Workspace } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSourceDialog } from './marketplace-source-dialog';

const workspace: Workspace = {
  id: 'ws_science',
  name: 'science',
  display_name: 'Science workspace',
  path: '/work/science',
  connection_id: 'conn_local',
  pinned: false,
  source_folders: [{ name: 'marketplace', path: '/work/science/marketplace', primary: true }],
};

afterEach(cleanup);

describe('MarketplaceSourceDialog', () => {
  it('browses agent-visible folders while keeping manual entry secondary', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <MarketplaceSourceDialog
        onAdd={onAdd}
        onOpenChange={vi.fn()}
        open
        pending={false}
        workspaces={[workspace]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Source type' }));
    await user.click(screen.getByRole('option', { name: 'Folder on agent' }));
    expect(screen.queryByRole('textbox', { name: 'Folder path' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Browse' }));
    await user.click(screen.getByRole('treeitem', { name: 'marketplace' }));
    await user.click(screen.getByRole('button', { name: 'Use this folder' }));
    await user.click(screen.getByRole('button', { name: 'Add marketplace' }));

    expect(onAdd).toHaveBeenCalledWith({
      name: '/work/science/marketplace',
      source: '/work/science/marketplace',
      ref: undefined,
    });
  });
});
