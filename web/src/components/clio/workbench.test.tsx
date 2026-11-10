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
import { listTab, saveWorkbenchState } from './workbench-tab-storage';
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

/** A returning conversation: the pocket restores the Activity tab it showed last time. */
function restorePocket() {
  const activity = listTab('activity');
  saveWorkbenchState('workspace_1', { tabs: [activity], activeTabId: activity.id, pinnedIds: [] });
}

/** Tab names in strip order. */
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

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
    // No conversation: the pocket opens on its Files tab, and no list column sits beside it.
    expect(tabNames()).toEqual(['Files']);
    expect(strip().getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Files list' })).toHaveAttribute(
      'data-slot',
      'workbench-list-tab',
    );
    expect(document.querySelector('[data-slot="workbench-list"]')).toBeNull();
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: /Resize/ })).not.toBeInTheDocument();
    // Work folds into Activity: asking for it opens the Activity tab, listing events until a session exists.
    await act(async () => handle.current?.open({ kind: 'resources', section: 'work' }));
    expect(strip().getByRole('button', { name: 'Activity' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const list = screen.getByRole('region', { name: 'Activity list' });
    expect(within(list).getByText('Activity starts with the first message')).toBeVisible();
    expect(within(list).queryByRole('radiogroup', { name: 'Activity view' })).toBeNull();
    expect(tabNames()).toEqual(['Files', 'Activity']);
    expect(strip().getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('contains a broken canvas item without replacing the workspace', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    restorePocket();
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

    expect(screen.getByRole('alert')).toHaveTextContent('Could not open Activity');
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toBeVisible();
    await user.click(container.querySelector('[data-slot="frame-tab-close"]') as HTMLElement);
    // An emptied canvas that is still shown falls back to its Files tab, never an empty pane.
    expect(tabNames()).toEqual(['Files']);
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument();
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

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
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

  it('leads Activity with its timeline and switches to events or context in the tab', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    const activityButton = strip().getByRole('button', { name: 'Activity' });
    expect(activityButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    const activity = screen.getByRole('region', { name: 'Activity list' });
    expect(activity).toHaveAttribute('data-slot', 'workbench-list-tab');
    expect(within(activity).queryByRole('button', { name: /^Hide / })).not.toBeInTheDocument();
    expect(within(activity).getByText('Session intelligence')).toBeVisible();
    expect(within(activity).getByRole('radio', { name: 'Timeline' })).toBeChecked();

    await user.click(within(activity).getByRole('radio', { name: 'Events' }));
    expect(within(activity).getByText('Nothing has run yet')).toBeVisible();
    expect(within(activity).queryByText('Session intelligence')).not.toBeInTheDocument();

    await user.click(within(activity).getByRole('radio', { name: 'Context' }));
    expect(within(activity).getByText('Session intelligence')).toBeVisible();
    expect(within(activity).getByRole('radio', { name: 'Context' })).toBeChecked();
  });

  it('launches each list as a tab from the strip and returns on the lit icon', async () => {
    const user = userEvent.setup();
    renderWorkbench();
    const activityButton = strip().getByRole('button', { name: 'Activity' });
    expect(screen.getByRole('tablist').parentElement).toHaveClass('no-scrollbar');

    const artifacts = strip().getByRole('button', { name: 'Artifacts' });
    await user.click(artifacts);
    expect(artifacts).toHaveAttribute('aria-pressed', 'true');
    expect(activityButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No artifacts in this conversation')).toBeVisible();

    // The lit icon again goes back to the tab shown before; the list tab stays for next time.
    await user.click(artifacts);
    expect(artifacts).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    expect(tabNames()).toEqual(['Activity', 'Artifacts']);

    // A launcher focuses its tab rather than opening another, Files included.
    await user.click(artifacts);
    expect(screen.getAllByRole('tab', { name: 'Artifacts' })).toHaveLength(1);
    const files = strip().getByRole('button', { name: 'Files' });
    await user.click(files);
    expect(files).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-slot="workbench-list"]')).toBeNull();
    await user.click(files);
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
  });

  it('toggles the Agent tab back to the previous tab', async () => {
    const user = userEvent.setup();
    renderWorkbench();
    const agent = strip().getByRole('button', { name: 'Agent' });

    await user.click(agent);
    expect(agent).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true');
    await user.click(agent);
    expect(agent).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  });

  it('turns a list column saved by an older build into its tab', () => {
    window.localStorage.setItem(
      'clio.workbench-tabs.v1:workspace_1',
      JSON.stringify({
        tabs: [{ id: 'session', kind: 'session', label: 'Timeline' }],
        activeTabId: 'session',
        listView: 'artifacts',
        pinnedIds: [],
      }),
    );
    renderWorkbench();

    // The old timeline tab is Activity now; the list column is a tab, still in view.
    expect(tabNames()).toEqual(['Activity', 'Artifacts']);
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-slot="workbench-list"]')).toBeNull();
  });

  it('keeps the shown tab when an older build had the Files column beside it', () => {
    window.localStorage.setItem(
      'clio.workbench-tabs.v1:workspace_1',
      JSON.stringify({
        tabs: [{ id: 'session', kind: 'session', label: 'Timeline' }],
        activeTabId: 'session',
        listView: 'files',
        pinnedIds: [],
      }),
    );
    renderWorkbench();

    expect(tabNames()).toEqual(['Activity', 'Files']);
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a pick in its list tab with Back, and opens a tab of its own on Shift', async () => {
    const user = userEvent.setup();
    render(
      <ClioWorkbench
        artifacts={[
          REPORT,
          { ...REPORT, id: 'input_1', name: 'stations.csv', media_type: 'text/csv' },
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
    const list = () => screen.getByRole('region', { name: 'Artifacts list' });

    // A click shows the artifact in the Artifacts tab itself...
    await user.click(within(list()).getByRole('button', { name: /report\.md/ }));
    expect(tabNames()).toEqual(['Activity', 'report.md']);
    expect(screen.getByRole('tab', { name: 'report.md' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Artifact view: report.md')).toBeVisible();
    // ...where the strip no longer lights Artifacts, and Back returns to the list.
    expect(strip().getByRole('button', { name: 'Artifacts' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Back to Artifacts' }));
    expect(tabNames()).toEqual(['Activity', 'Artifacts']);
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');

    // Shift opens the pick in a tab of its own and keeps the list.
    await user.keyboard('{Shift>}');
    await user.click(within(list()).getByRole('button', { name: /stations\.csv/ }));
    await user.keyboard('{/Shift}');
    expect(tabNames()).toEqual(['Activity', 'Artifacts', 'stations.csv']);
    expect(screen.getByRole('tab', { name: 'stations.csv' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument();

    // Back on the list, the row marks the tab it last opened; the lit icon returns to it.
    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    expect(within(list()).getByRole('button', { name: /stations\.csv/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    expect(screen.getByRole('tab', { name: 'stations.csv' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens a pick from a pinned list tab beside it', async () => {
    const user = userEvent.setup();
    const artifacts = listTab('artifacts');
    saveWorkbenchState('workspace_1', {
      tabs: [artifacts],
      activeTabId: artifacts.id,
      pinnedIds: [artifacts.id],
    });
    render(
      <ClioWorkbench
        artifacts={[REPORT]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        sessionId="session_parent"
        sessionView={<p>Session intelligence</p>}
        workspaceId="workspace_1"
      />,
    );
    const list = screen.getByRole('region', { name: 'Artifacts list' });
    await user.click(within(list).getByRole('button', { name: /report\.md/ }));
    expect(tabNames()).toEqual(['Artifacts, pinned', 'report.md']);
  });

  it('closes the canvas and leaves maximize when its last tab closes', async () => {
    const user = userEvent.setup();
    const hide = vi.fn();
    restorePocket();
    render(
      <WorkspaceCanvasControlContext.Provider
        value={{ show: vi.fn(), clearPendingStripPosition: vi.fn(), hide }}
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
    await user.click(screen.getByRole('button', { name: 'Maximize canvas' }));
    const canvas = screen.getByRole('complementary', { name: 'Workspace canvas' });
    expect(canvas).toHaveAttribute('data-maximized', 'true');
    // Maximized, the tabs fill the canvas: there is no list column to share it with.
    expect(document.querySelector('[data-slot="workbench-list"]')).toBeNull();

    // The lit icon of the only tab closes it, and with it the canvas.
    await user.click(strip().getByRole('button', { name: 'Activity' }));
    expect(hide).toHaveBeenCalledTimes(1);
    // Restoring re-parents the canvas out of the maximize host: query it again.
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).not.toHaveAttribute(
      'data-maximized',
    );
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument();
  });

  it('returns the canvas to its stored width when a list tab is left', async () => {
    const user = userEvent.setup();
    const fitWidth = vi.fn();
    restorePocket();
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
    // Activity's timeline keeps the stored width.
    expect(fitWidth).toHaveBeenLastCalledWith(undefined);

    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    fitWidth.mockClear();
    await user.click(strip().getByRole('button', { name: 'Artifacts' }));
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
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

    // An open request from the conversation always gets a tab of its own.
    openWork();
    const activityTab = screen.getByRole('tab', { name: 'Activity' });
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
    expect(activityTab).toHaveAccessibleName('Activity');
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
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    await user.click(container.querySelector('[data-slot="frame-tab-close"]') as HTMLElement);
    expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument();
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

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'report.md' }));
    await user.click(await screen.findByRole('menuitem', { name: /Pin/ }));
    // Pinned tabs go first and keep their name for assistive tech.
    expect(screen.getAllByRole('tab')[0]).toHaveAccessibleName(/^report\.md, pinned/);
    expect(tabNames()).toEqual(['report.md, pinned', 'Activity']);

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
    expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^report\.md/ })).toBeInTheDocument();
  });

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

  it('closes and reopens Activity as a normal canvas tab', async () => {
    const user = userEvent.setup();
    restorePocket();
    renderWorkbench();

    const activityTab = screen.getByRole('tab', { name: 'Activity' });
    act(() => activityTab.focus());
    await user.keyboard('{Delete}');
    expect(tabNames()).toEqual(['Files']);

    await user.click(strip().getByRole('button', { name: 'Activity' }));
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
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
