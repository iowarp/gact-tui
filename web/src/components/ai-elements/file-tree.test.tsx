import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileTree, FileTreeFile, FileTreeFolder } from './file-tree';

afterEach(cleanup);

describe('FileTree', () => {
  it('expands folders from the whole labeled row without selecting them as files', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <FileTree onSelect={onSelect}>
        <FileTreeFolder name="campaign_data" path="campaign_data">
          <FileTreeFile name="calibration.json" path="campaign_data/calibration.json" />
        </FileTreeFolder>
      </FileTree>,
    );

    await user.click(screen.getByRole('button', { name: 'Expand folder campaign_data' }));

    expect(onSelect).not.toHaveBeenCalled();
    const collapseFolder = screen.getByRole('button', { name: 'Collapse folder campaign_data' });
    expect(collapseFolder).toBeVisible();
    expect(screen.getByRole('treeitem', { name: 'calibration.json' })).toBeVisible();

    await user.click(screen.getByRole('treeitem', { name: 'calibration.json' }));
    expect(onSelect).toHaveBeenCalledWith('campaign_data/calibration.json');

    collapseFolder.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Expand folder campaign_data' })).toBeVisible();
  });
});
