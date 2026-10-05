import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SessionExportMenu } from './session-export-menu';

afterEach(cleanup);

describe('session export modes', () => {
  it('defaults to transcript and enforces full implies effects', async () => {
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
    await user.click(screen.getByRole('menuitem', { name: 'Export session' }));
    expect(screen.getByRole('menuitem', { name: 'Download transcript archive' })).toBeVisible();
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Full: include workspace files' }),
    );
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Effects: include session artifacts' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitem', { name: 'Download full archive' })).toBeVisible();
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Full: include workspace files' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Download effects archive' })).toBeVisible();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download effects archive' }));
    expect(download).toHaveBeenCalledWith('effects');
  });
});
