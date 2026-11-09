import {
  cleanup,
  render as renderComponent,
  type RenderResult,
  screen,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileBrowser } from './workbench-resource-browser';

const { useAppearancePreferences } = vi.hoisted(() => ({
  // Default matches the real provider's default (owner ruling: dot files are
  // visible by default; "Hide dot files and folders" is opt-in).
  useAppearancePreferences: vi.fn(() => ({ hideDotFiles: false })),
}));

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ readWorkspaceFile: vi.fn(), readWorkspaceFileRange: vi.fn() }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({ useAppearancePreferences }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAppearancePreferences.mockReturnValue({ hideDotFiles: false });
});

function render(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderComponent(ui, {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('FileBrowser', () => {
  it('shows managed workspace inputs under the Sources group without exposing the rest of .clio', async () => {
    const user = userEvent.setup();
    render(
      <FileBrowser
        files={[
          {
            path: '.clio/inputs/res_abc/paper.pdf',
            display_path: 'Sources/res_abc/paper.pdf',
            type: 'file',
            internal: false,
            source: 'managed_input',
            resource_id: 'res_abc',
            media_type: 'application/pdf',
            size: 1024,
          },
        ]}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.queryByText('.clio')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand folder Sources' }));
    await user.click(screen.getByRole('button', { name: 'Expand folder res_abc' }));
    expect(screen.getByRole('treeitem', { name: 'paper.pdf' })).toBeVisible();
  });

  it('shows a clear notice when the server reports a truncated listing', () => {
    render(
      <FileBrowser
        files={[{ path: 'report.md', type: 'file', internal: false, size: 7 }]}
        filesTruncated
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByText(/truncated/i)).toBeVisible();
  });

  it('does not show a truncated notice when the listing is complete', () => {
    render(
      <FileBrowser
        files={[{ path: 'report.md', type: 'file', internal: false, size: 7 }]}
        filesTruncated={false}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.queryByText(/truncated/i)).not.toBeInTheDocument();
  });

  it("shows a redacted folder's reason instead of a silently empty tree", async () => {
    const user = userEvent.setup();
    render(
      <FileBrowser
        files={[
          {
            path: '.clio-child-cache',
            type: 'dir',
            internal: false,
            redacted: 'sandbox_child_cache',
          },
        ]}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Expand folder .clio-child-cache' }));

    expect(screen.getByText('Sandbox cache — contents not shown')).toBeVisible();
  });

  it('renders whatever files it is given — filtering moved to the server/query layer', () => {
    // Review follow-up: "Hide dot files and folders" now reaches the SERVER as
    // include_hidden (use-workspace-data.ts), so a huge .clio is never walked
    // client-side only to be discarded after paying for it out of the shared
    // entry cap. FileBrowser must not ALSO filter — that would silently
    // double-hide entries the toggle already excluded, or mask a query-layer
    // regression that stopped filtering. FileBrowser renders exactly the
    // `files` prop it receives, regardless of the toggle's state.
    useAppearancePreferences.mockReturnValue({ hideDotFiles: true });
    render(
      <FileBrowser
        files={[
          { path: '.clio/state.json', type: 'file', internal: false, size: 2 },
          { path: 'report.md', type: 'file', internal: false, size: 7 },
        ]}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByRole('treeitem', { name: '.clio' })).toBeVisible();
    expect(screen.getByRole('treeitem', { name: 'report.md' })).toBeVisible();
  });

  it('hints at the dot-files toggle when the server-filtered file list comes back empty', () => {
    useAppearancePreferences.mockReturnValue({ hideDotFiles: true });
    render(
      <FileBrowser
        files={[]}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByText(/Hide dot files and folders.*is on/)).toBeVisible();
  });

  it('refetches once as soon as the Files view mounts (opening the tab)', () => {
    const onRefresh = vi.fn();
    render(
      <FileBrowser
        files={[]}
        onRefresh={onRefresh}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('spins and refetches again when the manual Refresh button is clicked', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const { rerender } = render(
      <FileBrowser
        files={[]}
        onRefresh={onRefresh}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );
    const callsAfterMount = onRefresh.mock.calls.length;
    const button = screen.getByRole('button', { name: 'Refresh files' });
    expect(button.querySelector('svg')).not.toHaveClass('animate-spin');

    await user.click(button);
    expect(onRefresh.mock.calls.length).toBe(callsAfterMount + 1);

    rerender(
      <FileBrowser
        files={[]}
        filesFetching
        onRefresh={onRefresh}
        onSelectedPathChange={vi.fn()}
        selectedPath={undefined}
        workspaceId="workspace_1"
      />,
    );
    expect(button.querySelector('svg')).toHaveClass('animate-spin');
  });
});
