import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { registerComposerReferenceTarget } from '@/lib/composer-reference-requests';
import userEvent from '@testing-library/user-event';
import { createRef, useContext } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Rendered workspace files resolve the Markdown renderer behind a React.lazy
// boundary (MessageResponse -> ./markdown: streamdown, math, cjk). Loaded
// lazily, its evaluation lands inside whichever test renders Markdown first and
// is charged to that test's 5s budget. Importing it here loads it at collection,
// which has no timeout; the lazy boundary then resolves from the module cache.
import '@/components/ai-elements/markdown';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';
import { ObservabilityViewControl } from './observability-view-control';
import { listTab, saveWorkbenchState } from './workbench-tab-storage';
import { WorkspaceCanvasVisibilityProvider } from './workspace-canvas-visibility';
import { WorkspaceCanvasControlContext } from './workspace-canvas-visibility-context';
import {
  REPORT,
  render,
  renderWorkbench,
  restorePocket,
  strip,
  tabNames,
} from './workbench-test-helpers';
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

/**
 * Stands in for the observability dock in the Activity tab: like the real one it
 * draws the host's header (title and Activity views menu), then its view.
 */
function SessionViewWithHeader() {
  const control = useContext(ObservabilityViewControl);
  return (
    <>
      {control?.renderHeader?.(null)}
      <p>Session intelligence</p>
    </>
  );
}

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
    render(
      <ClioWorkbench
        artifacts={[]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        sessionId="session_parent"
        sessionView={<SessionViewWithHeader />}
        workspaceId="workspace_1"
      />,
    );

    // A fresh pocket opens on Files; Activity opens from its strip icon.
    const activityButton = strip().getByRole('button', { name: 'Activity' });
    await user.click(activityButton);
    expect(activityButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    const activity = screen.getByRole('region', { name: 'Activity list' });
    expect(activity).toHaveAttribute('data-slot', 'workbench-list-tab');
    expect(within(activity).queryByRole('button', { name: /^Hide / })).not.toBeInTheDocument();
    expect(within(activity).getByText('Session intelligence')).toBeVisible();
    // The other views are in the header's Activity views menu; Timeline leads.
    const chooseView = async (name: string) => {
      await user.click(within(activity).getByRole('button', { name: 'Activity views' }));
      await user.click(await screen.findByRole('menuitemradio', { name }));
    };
    await user.click(within(activity).getByRole('button', { name: 'Activity views' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Timeline' })).toBeChecked();
    await user.keyboard('{Escape}');

    await chooseView('Events');
    expect(within(activity).getByText('Nothing has run yet')).toBeVisible();
    expect(within(activity).queryByText('Session intelligence')).not.toBeInTheDocument();

    await chooseView('Context');
    expect(within(activity).getByText('Session intelligence')).toBeVisible();
    await user.click(within(activity).getByRole('button', { name: 'Activity views' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Context' })).toBeChecked();
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
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
    expect(tabNames()).toEqual(['Files', 'Artifacts']);

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
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
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
    expect(tabNames()).toEqual(['Files', 'report.md']);
    expect(screen.getByRole('tab', { name: 'report.md' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Artifact view: report.md')).toBeVisible();
    // ...where the strip no longer lights Artifacts, and Back returns to the list.
    expect(strip().getByRole('button', { name: 'Artifacts' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Back to Artifacts' }));
    expect(tabNames()).toEqual(['Files', 'Artifacts']);
    expect(screen.getByRole('tab', { name: 'Artifacts' })).toHaveAttribute('aria-selected', 'true');

    // Shift opens the pick in a tab of its own and keeps the list.
    await user.keyboard('{Shift>}');
    await user.click(within(list()).getByRole('button', { name: /stations\.csv/ }));
    await user.keyboard('{/Shift}');
    expect(tabNames()).toEqual(['Files', 'Artifacts', 'stations.csv']);
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
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).not.toHaveAttribute(
      'data-maximized',
    );
    expect(screen.queryByText('No tabs open')).not.toBeInTheDocument();
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

    expect(onOpenTerminal).toHaveBeenCalledOnce();
  });

  it('keeps the terminal on the strip when the shared terminal action is absent', () => {
    renderWorkbench();

    expect(strip().getByRole('button', { name: 'Terminal' })).toBeVisible();
    expect(strip().getByRole('button', { name: 'Browser' })).toBeVisible();
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
});
