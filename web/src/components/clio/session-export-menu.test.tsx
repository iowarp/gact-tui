import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SessionExportMenu } from './session-export-menu';
import { selectMenuKey } from './select-menu-key';

afterEach(cleanup);

describe('session export modes', () => {
  it('downloads the transcript as HTML and the chosen files as a ZIP', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <SessionExportMenu onExport={download} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Artifacts' })).toHaveAccessibleDescription(
      'files the agent made',
    );
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Workspace files' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Artifacts' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Artifacts' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Workspace files' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // A ZIP needs files beyond the transcript.
    expect(screen.getByRole('menuitem', { name: 'Download ZIP' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download HTML' }));
    expect(download).toHaveBeenCalledWith('transcript');
  });

  it('defaults to the transcript with artifacts in a ZIP', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent onKeyDown={selectMenuKey}>
          <SessionExportMenu onExport={download} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export' }));
    await user.keyboard('z');
    expect(download).toHaveBeenCalledWith('effects');
  });
});
