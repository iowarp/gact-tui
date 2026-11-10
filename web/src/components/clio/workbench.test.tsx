import {
  act,
  cleanup,
  fireEvent,
  render as renderComponent,
  type RenderResult,
  screen,
  within,
} from '@testing-library/react';
import type { SessionDiff } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerComposerReferenceTarget } from '@/lib/composer-reference-requests';
import userEvent from '@testing-library/user-event';
import { createRef, type PropsWithChildren, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Rendered workspace files resolve the Markdown renderer behind a React.lazy
// boundary (MessageResponse -> ./markdown: streamdown, math, cjk). Loaded
// lazily, its evaluation lands inside whichever test renders Markdown first and
// is charged to that test's 5s budget. Importing it here loads it at collection,
// which has no timeout; the lazy boundary then resolves from the module cache.
import '@/components/ai-elements/markdown';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';
import { FileBrowser } from './workbench-resource-browser';
import { saveWorkbenchState, sessionTab } from './workbench-tab-storage';
import { WorkspaceCanvasVisibilityProvider } from './workspace-canvas-visibility';
import { WorkspaceCanvasControlContext } from './workspace-canvas-visibility-context';
import { rangeReadsFromText } from '@/test/workspace-file-range';

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
// here by a view that only names the artifact it was given.
vi.mock('./resource-viewers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resource-viewers')>()),
  ArtifactView: ({ artifact }: { artifact: { name: string } }) => (
    <article aria-label={`Artifact view: ${artifact.name}`}>{artifact.name}</article>
  ),
}));

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

/** Give standalone canvas tests the query context used by the real workspace. */
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

function renderWorkbench() {
  return render(
    <ClioWorkbench
      artifacts={[]}
      diffs={[]}
      files={[]}
      onOpenSubagent={vi.fn()}
      onUndoDiff={vi.fn()}
      sessionId="session_parent"
      sessionView={<p>Session intelligence</p>}
      workspaceId="workspace_1"
    />,
  );
}

/** The strip of list and tab openers on the panel's outer edge. */
function strip() {
  return within(screen.getByRole('toolbar', { name: 'Workbench lists' }));
}

/** A returning conversation: the pocket restores what it showed last time. */
function restorePocket({
  timeline = true,
  listView = 'files',
}: { timeline?: boolean; listView?: 'files' | null } = {}) {
  saveWorkbenchState('workspace_1', {
    tabs: timeline ? [sessionTab] : [],
    activeTabId: timeline ? sessionTab.id : '',
    listView: listView ?? undefined,
    pinnedIds: [],
  });
}

const REPORT = {
  id: 'report_1',
  session_id: 'session_parent',
  workspace_id: 'workspace_1',
  name: 'report.md',
  media_type: 'text/markdown',
  size: 8,
  uri: 'artifact://workspace_1/report.md@v1',
  session_relation: 'produced' as const,
};

function BrokenCanvasItem(): never {
  throw new Error('broken source preview');
}

describe('ClioWorkbench canvas', () => {
  it('opens workspace files without allocating a session and keeps session-only panels idle', async () => {
    const handle = createRef<ClioWorkbenchHandle>();
    render(
      <ClioWorkbench
        ref={handle}
        workspaceId="workspace_1"
        sessionId=""
        files={[]}
        artifacts={[]}
        diffs={[]}
        onUndoDiff={vi.fn()}
        onOpenSubagent={vi.fn()}
        sessionView={<p>Send your first message to see session activity.</p>}
      />,
    );
    // No conversation: no tabs, and the Files list takes the whole workbench, no empty pane beside it.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(strip().getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Files list' })).toHaveAttribute('data-fill', 'true');
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: /Resize/ })).not.toBeInTheDocument();
    // Work folds into Activity: asking for it opens the Activity tab, not a session tab.
    await act(async () => handle.current?.open({ kind: 'resources', section: 'work' }));
    expect(strip().getByRole('button', { name: 'Activity' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const list = screen.getByRole('region', { name: 'Activity list' });
    expect(within(list).getByText('Activity starts with the first message')).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Activity']);
    // Files drops back to the resizable column beside it.
    expect(screen.getByRole('region', { name: 'Files list' })).not.toHaveAttribute('data-fill');
  });
  it('contains a broken canvas item without replacing the workspace', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    restorePocket({ listView: null });
    const { container } = render(
      <ClioWorkbench
        artifacts={[]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        sessionId="session_parent"
        sessionView={<BrokenCanvasItem />}
        workspaceId="workspace_1"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not open Timeline');
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
    await user.click(container.querySelector('[data-slot="frame-tab-close"]') as HTMLElement);
    expect(screen.getByText('No tabs open')).toBeVisible();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('keeps tabs mounted while suspending hidden canvas content', () => {
    restorePocket();
    const { rerender } = render(
      <WorkspaceCanvasVisibilityProvider visible={false}>
        <ClioWorkbench
          artifacts={[]}
          diffs={[]}
          files={[]}
          onOpenSubagent={vi.fn()}
          onUndoDiff={vi.fn()}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </WorkspaceCanvasVisibilityProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Session intelligence')).not.toBeInTheDocument();

    rerender(
      <WorkspaceCanvasVisibilityProvider visible>
        <ClioWorkbench
          artifacts={[]}
          diffs={[]}
          files={[]}
          onOpenSubagent={vi.fn()}
          onUndoDiff={vi.fn()}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </WorkspaceCanvasVisibilityProvider>,
    );

    expect(screen.getByText('Session intelligence')).toBeVisible();
  });

  it('starts a conversation on its Activity tab and launches each list as a tab from the strip', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
    // A fresh pocket opens on its Activity tab; no list column sits beside it.
    const activityButton = strip().getByRole('button', { name: 'Activity' });
    expect(activityButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    const activity = screen.getByRole('region', { name: 'Activity list' });
    expect(activity).toHaveAttribute('data-slot', 'workbench-list-tab');
    expect(within(activity).queryByRole('button', { name: /^Hide / })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="workbench-list"]')).toBeNull();

    await user.click(within(activity).getByRole('button', { name: 'Open timeline and context' }));
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Session intelligence')).toBeVisible();
    expect(screen.getByRole('tablist').parentElement).toHaveClass('no-scrollbar');
    expect(activityButton).toHaveAttribute('aria-pressed', 'false');

    const artifacts = strip().getByRole('button', { name: 'Artifacts' });
    await user.click(artifacts);
    expect(artifacts).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Artifacts list' })).toBeVisible();
    expect(screen.getByText('No artifacts in this conversation')).toBeVisible();

    // The lit icon again goes back to the tab shown before; the list tab stays for next time.
    await user.click(artifacts);
    expect(artifacts).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    // A launcher focuses its tab rather than opening another.
    await user.click(artifacts);
    expect(screen.getAllByRole('tab', { name: 'Artifacts' })).toHaveLength(1);
    await user.click(activityButton);
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    await user.click(activityButton);
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
  });

  it('toggles the Agent tab back to the previous tab, and closes a lone list tab', async () => {
    const user = userEvent.setup();
    renderWorkbench();
    const agent = strip().getByRole('button', { name: 'Agent' });

    await user.click(agent);
    expect(agent).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true');
    await user.click(agent);
    expect(agent).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');

    act(() => screen.getByRole('tab', { name: 'Agent' }).focus());
    await user.keyboard('{Delete}');
    // With no tab to go back to, the lit icon closes its tab.
    await user.click(strip().getByRole('button', { name: 'Activity' }));
    expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.getByText('No tabs open')).toBeVisible();
  });

  it('keeps Files as the column beside the tabs', async () => {
    const user = userEvent.setup();
    restorePocket({ listView: null });
    renderWorkbench();
    const files = strip().getByRole('button', { name: 'Files' });

    await user.click(files);
    expect(files).toHaveAttribute('aria-pressed', 'true');
    const column = screen.getByRole('region', { name: 'Files list' });
    expect(column).toHaveAttribute('data-slot', 'workbench-list');
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');

    // A list tab opens beside the Files column, which stays.
    await user.click(strip().getByRole('button', { name: 'Sources' }));
    expect(screen.getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Files list' })).toBeVisible();

    await user.click(files);
    expect(screen.queryByRole('region', { name: 'Files list' })).not.toBeInTheDocument();
  });

  it('turns a list column saved by an older build into its tab', () => {
    restorePocket({ listView: 'artifacts' as 'files' });
    renderWorkbench();

    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-slot="workbench-list"]')).toBeNull();
  });

  it('lets the Files column fill the workbench once the last tab closes', async () => {
    const user = userEvent.setup();
    restorePocket();
    const { container } = renderWorkbench();
    const column = () => screen.getByRole('region', { name: 'Files list' });
    expect(column()).not.toHaveAttribute('data-fill');

    await user.click(container.querySelector('[data-slot="frame-tab-close"]') as HTMLElement);
    expect(column()).toHaveAttribute('data-fill', 'true');
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('returns the canvas to its stored width when a list tab is left', async () => {
    const user = userEvent.setup();
    const fitWidth = vi.fn();
    restorePocket({ listView: null });
    render(
      <WorkspaceCanvasControlContext.Provider
        value={{ show: vi.fn(), clearPendingStripPosition: vi.fn(), fitWidth }}
      >
        <ClioWorkbench
          artifacts={[]}
          diffs={[]}
          files={[]}
          onOpenSubagent={vi.fn()}
          onUndoDiff={vi.fn()}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </WorkspaceCanvasControlContext.Provider>,
    );
    expect(fitWidth).toHaveBeenLastCalledWith(undefined);

    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    fitWidth.mockClear();
    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    expect(fitWidth).toHaveBeenLastCalledWith(undefined);
  });

  it('offers the terminal from the strip when the workspace terminal is available', async () => {
    const user = userEvent.setup();
    const onOpenTerminal = vi.fn();
    render(
      <ClioWorkbench
        artifacts={[]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onOpenTerminal={onOpenTerminal}
        onUndoDiff={vi.fn()}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );

    await user.click(strip().getByRole('button', { name: 'Terminal' }));
    const list = screen.getByRole('region', { name: 'Terminal list' });
    await user.click(within(list).getByRole('button', { name: /Open a terminal/ }));

    expect(onOpenTerminal).toHaveBeenCalledOnce();
  });

  it('leaves the terminal off the strip when the shared terminal action is absent', () => {
    renderWorkbench();

    expect(strip().queryByRole('button', { name: 'Terminal' })).not.toBeInTheDocument();
    expect(strip().getByRole('button', { name: 'Browser pages' })).toBeVisible();
  });

  it('closes a tab by pointer, middle click, or its announced shortcut', async () => {
    const user = userEvent.setup();
    const handle = createRef<ClioWorkbenchHandle>();
    restorePocket();
    const { container } = render(
      <ClioWorkbench
        artifacts={[]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        ref={handle}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );
    const openWork = () => act(() => handle.current?.open({ kind: 'artifact', artifact: REPORT }));

    openWork();
    const activityTab = screen.getByRole('tab', { name: 'Timeline' });
    const workTab = screen.getByRole('tab', { name: 'report.md' });
    const closeControls = container.querySelectorAll('[data-slot="frame-tab-close"]');

    // A tablist may own nothing but tabs, and a tab's own children are presentational, so an
    // interactive close control is a critical violation on either side of the trigger:
    // aria-required-children as a sibling, nested-interactive as a child. The X is therefore a
    // pointer affordance held out of the accessibility tree, and the announced Delete shortcut
    // is what assistive tech uses. The tab keeps its own unpolluted name either way.
    for (const control of closeControls) {
      expect(control).toHaveAttribute('aria-hidden', 'true');
      expect(control).not.toHaveAttribute('tabindex');
    }
    expect(screen.queryByRole('button', { name: /^Close / })).not.toBeInTheDocument();
    expect(activityTab).toHaveAccessibleName('Timeline');
    expect(activityTab).toHaveAttribute('aria-keyshortcuts', 'Delete');

    act(() => workTab.focus());
    await user.keyboard('{ArrowLeft}');
    expect(activityTab).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(workTab).toHaveAttribute('aria-selected', 'true');

    // Browser-style middle click closes the tab, while another auxiliary button does nothing.
    fireEvent(workTab, new MouseEvent('auxclick', { bubbles: true, button: 2, cancelable: true }));
    expect(screen.getByRole('tab', { name: 'report.md' })).toBeInTheDocument();
    fireEvent(workTab, new MouseEvent('auxclick', { bubbles: true, button: 1, cancelable: true }));
    expect(screen.queryByRole('tab', { name: 'report.md' })).not.toBeInTheDocument();
    expect(activityTab).toHaveAttribute('aria-selected', 'true');

    openWork();
    const reopenedWorkTab = screen.getByRole('tab', { name: 'report.md' });

    // The keyboard route the tab advertises closes it...
    act(() => reopenedWorkTab.focus());
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('tab', { name: 'report.md' })).not.toBeInTheDocument();

    // ...and the pointer affordance closes the one it sits on.
    await user.click(screen.getByRole('tab', { name: 'Timeline' }));
    await user.click(container.querySelector('[data-slot="frame-tab-close"]') as HTMLElement);
    expect(screen.queryByRole('tab', { name: 'Timeline' })).not.toBeInTheDocument();
  });

  it('pins, moves and closes tabs from the tab context menu', async () => {
    const user = userEvent.setup();
    const handle = createRef<ClioWorkbenchHandle>();
    restorePocket();
    render(
      <ClioWorkbench
        artifacts={[]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        ref={handle}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );
    act(() => handle.current?.open({ kind: 'artifact', artifact: REPORT }));
    const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'report.md' }));
    await user.click(await screen.findByRole('menuitem', { name: /Pin/ }));
    // Pinned tabs go first and keep their name for assistive tech.
    expect(screen.getAllByRole('tab')[0]).toHaveAccessibleName(/^report\.md, pinned/);
    expect(tabNames()).toEqual(['report.md, pinned', 'Timeline']);

    fireEvent.contextMenu(screen.getByRole('tab', { name: /^report\.md/ }));
    // Without an open composer the reference has nowhere to go.
    expect(await screen.findByRole('menuitem', { name: /Add to message/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');
    const added: unknown[] = [];
    let unregister = () => {};
    act(() => {
      unregister = registerComposerReferenceTarget({
        workspaceId: 'workspace_1',
        add: (reference) => added.push(reference),
      });
    });
    fireEvent.contextMenu(screen.getByRole('tab', { name: /^report\.md/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Add to message/ }));
    expect(added).toEqual([expect.objectContaining({ kind: 'artifact', label: 'report.md' })]);
    act(() => unregister());

    fireEvent.contextMenu(screen.getByRole('tab', { name: /^report\.md/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Close others/ }));
    expect(screen.queryByRole('tab', { name: 'Timeline' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^report\.md/ })).toBeInTheDocument();
  });

  it('opens an artifact from the Artifacts tab and marks it there when the list is back', async () => {
    const user = userEvent.setup();
    render(
      <ClioWorkbench
        artifacts={[
          {
            id: 'report_1',
            session_id: 'session_parent',
            workspace_id: 'workspace_1',
            name: 'report.md',
            media_type: 'text/markdown',
            size: 8,
            uri: 'artifact://workspace_1/report.md@v1',
            session_relation: 'produced',
          },
          {
            id: 'input_1',
            session_id: 'session_parent',
            workspace_id: 'workspace_1',
            name: 'stations.csv',
            media_type: 'text/csv',
            size: 23,
            uri: 'artifact://workspace_1/stations.csv@v1',
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
    const report = within(list).getByRole('button', { name: /report\.md/ });
    expect(report).toBeVisible();
    expect(within(list).getByRole('button', { name: /stations\.csv/ })).toBeVisible();
    // Made here groups first; what this conversation only read follows under Earlier.
    expect(within(list).getByText('This conversation')).toBeVisible();
    expect(within(list).getByText('Earlier')).toBeVisible();

    await user.click(report);
    expect(screen.getByRole('tab', { name: 'report.md' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Artifact view: report.md')).toBeVisible();
    expect(screen.queryByLabelText('Artifact view: stations.csv')).not.toBeInTheDocument();
    // Back on the Artifacts tab, the list marks the artifact it came from.
    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    expect(
      within(screen.getByRole('region', { name: 'Artifacts list' })).getByRole('button', {
        name: /report\.md/,
      }),
    ).toHaveAttribute('aria-current', 'true');
    // ...and the icon again returns to it.
    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    expect(screen.getByRole('tab', { name: 'report.md' })).toHaveAttribute('aria-selected', 'true');
  });

  it('closes and reopens activity as a normal canvas tab', async () => {
    const user = userEvent.setup();
    restorePocket({ listView: null });
    renderWorkbench();

    const activityTab = screen.getByRole('tab', { name: 'Timeline' });
    act(() => activityTab.focus());
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('tab', { name: 'Timeline' })).not.toBeInTheDocument();
    expect(screen.getByText('No tabs open')).toBeVisible();

    await user.click(strip().getByRole('button', { name: 'Activity' }));
    const list = screen.getByRole('region', { name: 'Activity list' });
    expect(within(list).getByText('Nothing has run yet')).toBeVisible();
    await user.click(within(list).getByRole('button', { name: 'Open timeline and context' }));

    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Session intelligence')).toBeVisible();
  });

  it('opens a new page when the Browser list opens with none', async () => {
    const user = userEvent.setup();
    repository.browserPages.mockResolvedValue([]);
    renderWorkbench();

    await user.click(strip().getByRole('button', { name: 'Browser pages' }));
    const list = screen.getByRole('region', { name: 'Browser pages list' });
    expect(await within(list).findByRole('textbox', { name: 'Address' })).toHaveFocus();
  });

  it('lists browser pages after "New page"', async () => {
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
    await user.click(strip().getByRole('button', { name: 'Browser pages' }));
    const rows = await within(
      screen.getByRole('region', { name: 'Browser pages list' }),
    ).findAllByRole('button', { name: /New page|Example/ });
    expect(rows.map((row) => row.textContent)).toEqual(['New page', 'Exampleexample.org']);
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

  it('keeps the Files list beside a directly opened rendered file', async () => {
    const user = userEvent.setup();
    const ref = createRef<ClioWorkbenchHandle>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    repository.readWorkspaceFile.mockResolvedValue('# workspace report');
    restorePocket({ timeline: false });
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
    const filesList = screen.getByRole('region', { name: 'Files list' });
    expect(within(filesList).getByRole('tree')).toBeVisible();
    await user.click(within(filesList).getByRole('button', { name: 'Expand folder reports' }));
    const fileRow = within(filesList).getByRole('treeitem', { name: 'summary.md' });
    expect(fileRow).toBeVisible();
    expect(fileRow).toHaveClass('min-w-0', 'w-full');
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
