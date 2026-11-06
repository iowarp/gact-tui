import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkspaceSourceFolder } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceFoldersBar } from './workspace-folders';

afterEach(cleanup);

const primary: WorkspaceSourceFolder = { path: '/work/sb8', name: 'sb8', primary: true };

describe('WorkspaceFoldersBar', () => {
  it('lists the folders the person allowed beside the workspace folder; a click copies the path', async () => {
    const user = userEvent.setup(); // installs the clipboard the browser would have
    render(
      <WorkspaceFoldersBar
        folders={[
          primary,
          { path: '/home/user/clio-outside-1905', name: 'clio-outside-1905', primary: false },
        ]}
      />,
    );
    const allowed = screen.getByRole('button', {
      name: 'clio-outside-1905, Allowed by you. Copy /home/user/clio-outside-1905',
    });
    expect(allowed).toHaveAttribute('title', '/home/user/clio-outside-1905');
    expect(screen.getByText('Workspace folder')).toBeVisible();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(allowed);
    expect(write).toHaveBeenCalledWith('/home/user/clio-outside-1905');
  });

  it('shows nothing when only the workspace folder is writable', () => {
    const { container } = render(<WorkspaceFoldersBar folders={[primary]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
