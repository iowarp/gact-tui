import { act, cleanup, screen, within } from '@testing-library/react';
import type { SessionDiff } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Rendered workspace files resolve the Markdown renderer behind a React.lazy
// boundary (MessageResponse -> ./markdown: streamdown, math, cjk). Loaded
// lazily, its evaluation lands inside whichever test renders Markdown first and
// is charged to that test's 5s budget. Importing it here loads it at collection,
// which has no timeout; the lazy boundary then resolves from the module cache.
import '@/components/ai-elements/markdown';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';
import { FileBrowser } from './workbench-resource-browser';
import { REPORT, render, renderWorkbench, strip, tabNames } from './workbench-test-helpers';
import { rangeReadsFromText } from '@/test/workspace-file-range';

// Records, files and pages opened in canvas tabs. Tab mechanics (strip, close,
// pin, maximize) stay in workbench.test.tsx, which shares this setup.
const { repository, useAppearancePreferences } = vi.hoisted(() => ({
  repository: {
    browserPages: vi.fn(),
    readWorkspaceFile: vi.fn(),
    readWorkspaceFileRange: vi.fn(),
  },
  // Default matches the real provider's default (owner ruling: dot files are
  // visible by default; "Hide dot files and folders" is opt-in).
  useAppearancePreferences: vi.fn(() => ({ hideDotFiles: false })),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
repository.readWorkspaceFileRange.mockImplementation(
  rangeReadsFromText(repository.readWorkspaceFile),
);
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({ useAppearancePreferences }));
// These tests are about canvas tabs: which tab an artifact opens in, and what
// replaces what. How an artifact renders (Markdown as a document, not source)
// is owned by resource-viewers.test.tsx. The real ArtifactView cost ~0.7s per
// opened artifact (payload fetch, lazy viewer, Markdown render) and timed the
// artifact-tab tests out under a loaded 2-worker run, so it is stood in for
// here by a view that only names the artifact it was given, under the frame bar
// every real view carries (it owns the Back control).
vi.mock('./resource-viewers', async (importOriginal) => {
  const { FrameBar } = await import('./primitives/frame-bar');
  return {
    ...(await importOriginal<typeof import('./resource-viewers')>()),
    ArtifactView: ({ artifact }: { artifact: { name: string } }) => (
      <article aria-label={`Artifact view: ${artifact.name}`}>
        <FrameBar label="File actions" where={artifact.name} />
        {artifact.name}
      </article>
    ),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // mockReturnValue survives clearAllMocks (only call history is cleared), so
  // restore the real provider's default explicitly between tests.
  useAppearancePreferences.mockReturnValue({ hideDotFiles: false });
  // Every test shares workspaceId="workspace_1"; workbench.tsx persists tab
  // state to localStorage keyed on it, so a test that closes or opens a tab
  // leaks that state into the next test's initial restoredWorkbenchState()
  // read unless it is cleared here.
  window.localStorage.clear();
});

describe('ClioWorkbench canvas', () => {
  it('groups the Artifacts tab by what this conversation made', async () => {
    const user = userEvent.setup();
    render(
      <ClioWorkbench
        artifacts={[
          REPORT,
          {
            ...REPORT,
            id: 'input_1',
            name: 'stations.csv',
            media_type: 'text/csv',
            session_relation: 'used',
          },
        ]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );

    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    const list = screen.getByRole('region', { name: 'Artifacts list' });
    expect(within(list).getByRole('button', { name: /report\.md/ })).toBeVisible();
    expect(within(list).getByRole('button', { name: /stations\.csv/ })).toBeVisible();
    // Made here groups first; what this conversation only read follows under Earlier.
    expect(within(list).getByText('This conversation')).toBeVisible();
    expect(within(list).getByText('Earlier')).toBeVisible();
  });

  it('opens a new page from the strip Browser with its address field focused', async () => {
    const user = userEvent.setup();
    repository.browserPages.mockResolvedValue([]);
    renderWorkbench();

    await user.click(strip().getByRole('button', { name: 'Browser' }));
    expect(await screen.findByRole('textbox', { name: 'Address' })).toHaveFocus();
  });

  it('lists the open browser pages from the Browser menu', async () => {
    const user = userEvent.setup();
    repository.browserPages.mockResolvedValue([
      {
        id: 'page_1',
        session_id: 'session_parent',
        url: 'https://example.org/',
        title: 'Example',
        host: 'example.org',
      },
    ]);
    renderWorkbench();
    await user.pointer({
      keys: '[MouseRight]',
      target: strip().getByRole('button', { name: 'Browser' }),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Show browser pages' }));
    const rows = await within(
      screen.getByRole('region', { name: 'Browser pages list' }),
    ).findAllByRole('button', { name: /New page|Example/ });
    // The list is plain page rows; New page stays on the strip's Browser.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(/^Exampleexample\.org/u);
    expect(screen.queryByRole('textbox', { name: 'Address' })).not.toBeInTheDocument();
  });

  it('opens a changed file as a durable record tab with Undo', () => {
    const ref = createRef<ClioWorkbenchHandle>();
    const diff: SessionDiff = {
      id: 'chg_1',
      path: 'src/analysis.py',
      status: 'applied',
      created: false,
      undo_available: true,
      unified_diff: '@@ -1 +1 @@\n-old\n+new',
    };
    render(
      <ClioWorkbench
        artifacts={[]}
        diffs={[diff]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        ref={ref}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );

    act(() => ref.current?.open({ kind: 'diff', diff }));

    expect(screen.getByRole('tab', { name: /^analysis\.py/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('File changed by the agent')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Undo this change' })).toBeVisible();
  });

  it('opens a rendered file as its own tab and finds it in the Files tab', async () => {
    const user = userEvent.setup();
    const ref = createRef<ClioWorkbenchHandle>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readWorkspaceFile.mockResolvedValue('# workspace report');
    render(
      <QueryClientProvider client={queryClient}>
        <ClioWorkbench
          artifacts={[]}
          diffs={[]}
          files={[{ path: 'reports/summary.md', type: 'file', internal: false, size: 18 }]}
          onOpenSubagent={vi.fn()}
          onUndoDiff={vi.fn()}
          ref={ref}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    act(() => ref.current?.open({ kind: 'workspace-file', path: 'reports/summary.md' }));

    expect(screen.getByRole('tab', { name: 'summary.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(strip().getByRole('button', { name: 'Files' }));
    const filesList = screen.getByRole('region', { name: 'Files list' });
    expect(within(filesList).getByRole('tree')).toBeVisible();
    await user.click(within(filesList).getByRole('button', { name: 'Expand folder reports' }));
    const fileRow = within(filesList).getByRole('treeitem', { name: 'summary.md' });
    expect(fileRow).toBeVisible();
    expect(fileRow).toHaveClass('min-w-0', 'w-full');
    // The file already has its tab: picking it there focuses that tab and keeps Files.
    await user.click(fileRow);
    expect(screen.getByRole('tab', { name: 'summary.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(tabNames()).toContain('Files');
    expect(
      await screen.findByRole('heading', { name: 'workspace report' }, { timeout: 5000 }),
    ).toBeVisible();
    const sourceTab = screen.getByRole('tab', { name: /^Source$/ });
    act(() => sourceTab.focus());
    await user.keyboard('{Enter}');
    const source = await screen.findByRole('tabpanel', { name: /^Source$/ }, { timeout: 5000 });
    expect(source).toBeVisible();
    expect(source.querySelector('pre code')).toHaveTextContent('# workspace report');
    expect(document.querySelector('[data-slot="code-block-scroll"]')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-auto',
    );
    expect(repository.readWorkspaceFile).toHaveBeenCalledWith(
      'workspace_1',
      'reports/summary.md',
      expect.any(AbortSignal),
    );
  }, 15000);

  it('renders a directly opened hidden workspace file even when the tree omits it', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readWorkspaceFile.mockResolvedValue('# Hidden skill source');
    const path = '.clio/skills/inspect-qualification-brief/SKILL.md';
    render(
      <QueryClientProvider client={queryClient}>
        <FileBrowser
          files={[]}
          onSelectedPathChange={vi.fn()}
          selectedPath={path}
          workspaceId="workspace_1"
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Hidden skill source' }, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.queryByText('Select a file')).not.toBeInTheDocument();
    expect(repository.readWorkspaceFile).toHaveBeenCalledWith(
      'workspace_1',
      path,
      expect.any(AbortSignal),
    );
  });

  it('delivers a requested tab when a compact canvas mounts after the request', () => {
    const diff: SessionDiff = {
      id: 'chg_compact',
      path: 'src/compact-canvas.py',
      status: 'applied',
      created: false,
      undo_available: true,
      unified_diff: '@@ -1 +1 @@\n-old\n+new',
    };

    render(
      <ClioWorkbench
        artifacts={[]}
        diffs={[diff]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        requestedOpen={{ key: 'request-1', request: { kind: 'diff', diff } }}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByRole('tab', { name: /^compact-canvas\.py/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('File changed by the agent')).toBeVisible();
  });
});
