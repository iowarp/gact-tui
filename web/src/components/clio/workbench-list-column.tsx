import type {
  Artifact as ArtifactEntity,
  BrowserPage,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  GlobeIcon,
  ListFilterIcon,
  PanelRightCloseIcon,
  SearchIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  ARTIFACT_CATEGORIES,
  artifactCategory,
  filterArtifacts,
  type ArtifactCategory,
} from '@/lib/artifact-categories';
import { artifactEvidenceLabel } from '@/lib/artifact-presentation';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { formatResourceSize } from '@/lib/format';
import { AddIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { Tag, MetaValue } from './primitives/tag';
import { BrowserNewPage } from './browser-new-page';
import { ObservabilityViewControl } from './observability-view-control';
import { browserPageLabel, useBrowserPages } from './use-browser-pages';
import { WorkbenchActivityList } from './workbench-activity-list';
import { FileBrowser } from './workbench-resource-browser';
import { WorkbenchListResizeHandle } from './workbench-list-resize';
import { GroupLabel, Rows } from './workbench-list-rows';
import { activateOnKey } from './workbench-row-keys';
import { SourcesList } from './workbench-sources-list';
import { useListFitWidth } from './workbench-list-fit';
import { useWorkbenchListWidth } from './workbench-list-width';
import type { WorkbenchListView } from './workbench-strip';
import { LIST_HEADER_SECONDARY, type ChangeCounts, type WorkbenchTab } from './workbench-shared';
import { WORKBENCH_LIST_TITLES } from './workbench-tab-storage';

export type WorkbenchActivityView = 'timeline' | 'events' | 'relationships' | 'context';

/** Timeline leads; the event list, family graph and context window are views in More. */
const ACTIVITY_VIEWS: readonly { value: WorkbenchActivityView; label: string; title: string }[] = [
  { value: 'timeline', label: 'Timeline', title: 'Activity' },
  { value: 'events', label: 'Events', title: 'Events' },
  { value: 'relationships', label: 'Relationships', title: 'Relationships' },
  { value: 'context', label: 'Context', title: 'Context' },
];

export interface WorkbenchListColumnProps {
  view: WorkbenchListView;
  /** The width its rows need untruncated, and the width it has. */
  onFitWidth?: (pixels: number, listWidth: number) => void;
  workspaceId: string;
  sessionId: string;
  tabs: readonly WorkbenchTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  // Files
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesFetching?: boolean;
  filesError?: string;
  filesTruncated?: boolean;
  filesNextOffset?: number | null;
  onRefreshFiles?: () => void;
  directory?: string;
  onClearDirectory: () => void;
  changedPaths: ReadonlySet<string>;
  changeCounts?: ChangeCounts;
  onOpenFile: (path: string) => void;
  // Sources
  resources: readonly WorkspaceResource[];
  resourcesPending?: boolean;
  resourcesError?: string;
  onOpenResource: (resource: WorkspaceResource) => void;
  // Artifacts
  artifacts: readonly ArtifactEntity[];
  artifactsPending?: boolean;
  artifactsError?: string;
  artifactsTruncated?: 'page_cap_reached' | 'cursor_cycle_detected';
  onOpenArtifact: (artifact: ArtifactEntity) => void;
  // Activity
  subagents: readonly SubagentRun[];
  finishedWorkHidden: boolean;
  /** The conversation's timeline and context window (Activity's Timeline and Context). */
  sessionView?: ReactNode;
  activityView?: WorkbenchActivityView;
  onActivityViewChange?: (view: WorkbenchActivityView) => void;
  /** Activity rows open their details, a change or Work as a tab. */
  onOpenTab: (tab: WorkbenchTab) => void;
  onOpenSubagent: (subagent: SubagentRun) => void;
  // Terminal and Browser
  onOpenTerminal?: () => void;
  onOpenBrowserPage: (page: BrowserPage) => void;
}

/**
 * A strip's list, as its workbench tab. A row shows its item in the tab
 * (Shift opens it in a tab of its own instead).
 */
export const WorkbenchListColumn = memo(function WorkbenchListColumn(
  props: WorkbenchListColumnProps,
) {
  const { view } = props;
  const title = WORKBENCH_LIST_TITLES[view];
  const renderHeader = (actions: ReactNode) => (
    <WorkbenchListHeader actions={actions} title={title} />
  );
  const body =
    view === 'activity' ? (
      <ActivityViews {...props} title={title} />
    ) : view === 'files' ? (
      <FilesList {...props} renderHeader={renderHeader} />
    ) : view === 'artifacts' ? (
      <ArtifactsList {...props} renderHeader={renderHeader} />
    ) : view === 'sources' ? (
      <SourcesList {...props} renderHeader={renderHeader} />
    ) : (
      <>
        {/* Terminal's tab already names it, and its header would carry no actions. */}
        {view === 'terminal' ? null : <WorkbenchListHeader title={title} />}
        <div className="min-h-0 flex-1 overflow-hidden">
          <ListBody {...props} />
        </div>
      </>
    );
  return (
    <WorkbenchListTabSection onFitWidth={props.onFitWidth} title={title}>
      {body}
    </WorkbenchListTabSection>
  );
});

/**
 * Activity: the causal timeline of this conversation and its child agents
 * first; every event as a flat list, the conversation family graph and the
 * context window are the header's other views (More).
 */
function ActivityViews({ title, ...props }: WorkbenchListColumnProps & { title: string }) {
  const { sessionView, onActivityViewChange } = props;
  const switchable = Boolean(sessionView && props.sessionId && onActivityViewChange);
  const activityView = switchable ? (props.activityView ?? 'timeline') : 'events';
  const current = ACTIVITY_VIEWS.find((view) => view.value === activityView)!;
  const viewMenu = switchable ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<MoreIcon />} label="Activity views" size="sm" tooltipSide="bottom" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onActivityViewChange?.(value as WorkbenchActivityView)}
          value={activityView}
        >
          {ACTIVITY_VIEWS.map((view) => (
            <DropdownMenuRadioItem key={view.value} value={view.value}>
              {view.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;
  const headerTitle = switchable ? current.title : title;
  const renderHeader = (actions: ReactNode) => (
    <WorkbenchListHeader
      actions={
        <>
          {actions}
          {viewMenu}
        </>
      }
      title={headerTitle}
    />
  );
  if (activityView !== 'events')
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-slot="activity-session">
        <ObservabilityViewControl.Provider
          value={{
            view:
              activityView === 'context' || activityView === 'relationships'
                ? activityView
                : 'activity',
            renderHeader,
          }}
        >
          {sessionView}
        </ObservabilityViewControl.Provider>
      </div>
    );
  return (
    <WorkbenchActivityList
      activeTabId={props.activeTabId}
      finishedWorkHidden={props.finishedWorkHidden}
      onOpenArtifact={props.onOpenArtifact}
      onOpenFile={props.onOpenFile}
      onOpenSubagent={props.onOpenSubagent}
      onOpenTab={props.onOpenTab}
      renderHeader={renderHeader}
      sessionId={props.sessionId}
      subagents={props.subagents}
      tabs={props.tabs}
      workspaceId={props.workspaceId}
    />
  );
}

function WorkbenchListTabSection({
  title,
  onFitWidth,
  children,
}: {
  title: string;
  onFitWidth?: (pixels: number, listWidth: number) => void;
  children: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useListFitWidth(sectionRef, onFitWidth);
  return (
    <section
      aria-label={`${title} list`}
      data-slot="workbench-list-tab"
      ref={sectionRef}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      {children}
    </section>
  );
}

/** The column beside the tabs that an open tab brings (a study tree). */
export function WorkbenchListSection({
  title,
  overlay,
  children,
}: {
  title: string;
  overlay: boolean;
  children: ReactNode;
}) {
  const { share, sectionRef, resizeTo, commit, reset } = useWorkbenchListWidth('list');
  return (
    <section
      aria-label={`${title} list`}
      data-slot="workbench-list"
      data-overlay={overlay || undefined}
      ref={sectionRef}
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-l border-border bg-sidebar',
        // Too narrow for both: the list is a sheet over the whole tab area, its
        // header in the tab row's place (never half of it, which would clip the
        // tab), and a pick closes it.
        overlay
          ? 'absolute inset-y-0 right-11 left-0 z-20 border-l-0'
          : // The tabs keep 280 px beside the list and the 44 px strip.
            'relative h-full max-w-[calc(100%-324px)] min-w-[180px]',
      )}
      style={overlay ? undefined : { width: `${Math.round(share * 1000) / 10}%` }}
    >
      {overlay ? null : (
        <WorkbenchListResizeHandle
          commit={commit}
          reset={reset}
          resizeTo={resizeTo}
          sectionRef={sectionRef}
          share={share}
          title={title}
        />
      )}
      {children}
    </section>
  );
}

export function WorkbenchListHeader({
  title,
  actions,
  onHide,
  titleYieldsWhenNarrow = false,
}: {
  title: string;
  actions?: ReactNode;
  /** Absent for a list in a tab: its tab closes it. */
  onHide?: () => void;
  /**
   * In a narrow header the title (which repeats its tab's name) leaves room
   * for the actions instead of being cut to a letter; it stays for screen readers.
   */
  titleYieldsWhenNarrow?: boolean;
}) {
  return (
    <div
      data-slot="workbench-list-header"
      className="group/list-header @container/list-header flex h-10 shrink-0 items-center gap-1 border-b border-border pr-1 pl-3.5"
    >
      <h2
        className={cn(
          'min-w-0 flex-1 truncate text-[12px] font-semibold text-muted-foreground',
          titleYieldsWhenNarrow && '@max-[360px]/list-header:sr-only',
        )}
      >
        {title}
      </h2>
      {actions}
      {onHide ? (
        <span className={LIST_HEADER_SECONDARY}>
          <IconButton
            icon={<PanelRightCloseIcon />}
            label={`Hide ${title}`}
            onClick={onHide}
            size="sm"
            tooltipSide="bottom"
          />
        </span>
      ) : null}
    </div>
  );
}

function ListBody(props: WorkbenchListColumnProps) {
  switch (props.view) {
    case 'files':
    case 'artifacts':
    case 'activity':
    case 'sources':
      return null;
    case 'terminal':
      return <TerminalList {...props} />;
    case 'browser':
      return <BrowserList {...props} />;
  }
}

function FilesList({
  workspaceId,
  sessionId,
  files,
  filesPending,
  filesFetching,
  filesError,
  filesTruncated,
  filesNextOffset,
  onRefreshFiles,
  directory,
  onClearDirectory,
  changedPaths,
  changeCounts,
  onOpenFile,
  tabs,
  activeTabId,
  renderHeader,
}: WorkbenchListColumnProps & { renderHeader: (actions: ReactNode) => ReactNode }) {
  const active = tabs.find((tab) => tab.id === activeTabId);
  const selectedPath =
    active?.kind === 'workspace-file' && active.workspaceId === workspaceId
      ? active.path
      : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <FileBrowser
          key={directory ?? ''}
          changeCounts={changeCounts}
          changedPaths={changedPaths}
          directory={directory}
          files={files}
          filesError={filesError}
          filesFetching={filesFetching}
          filesNextOffset={filesNextOffset}
          filesPending={filesPending}
          filesTruncated={filesTruncated}
          mode="tree"
          onClearDirectory={onClearDirectory}
          onRefresh={onRefreshFiles}
          onSelectedPathChange={onOpenFile}
          renderHeader={renderHeader}
          selectedPath={selectedPath}
          sessionId={sessionId}
          workspaceId={workspaceId}
          legend={
            changedPaths.size ? (
              <>
                <div aria-hidden="true" className="mx-2 mt-2.5 mb-1 h-px bg-border" />
                {/* The spec's exact wording; a narrow column wraps it rather than cutting it off. */}
                <p className="min-h-7 px-2 py-1.5 text-[11.5px] leading-[1.35] text-faint">
                  <span className="text-changed">Teal</span>: changed in this conversation
                </p>
              </>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function ArtifactsList({
  sessionId,
  artifacts,
  artifactsPending,
  artifactsError,
  artifactsTruncated,
  onOpenArtifact,
  tabs,
  activeTabId,
  renderHeader,
}: WorkbenchListColumnProps & { renderHeader: (actions: ReactNode) => ReactNode }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ArtifactCategory | 'all'>('all');
  const counts = useMemo(() => {
    const result = new Map<ArtifactCategory, number>();
    for (const artifact of artifacts) {
      const kind = artifactCategory(artifact);
      result.set(kind, (result.get(kind) ?? 0) + 1);
    }
    return result;
  }, [artifacts]);
  const visible = useMemo(
    () => filterArtifacts(artifacts, query, category),
    [artifacts, query, category],
  );
  const filtered = Boolean(query.trim() || category !== 'all');
  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };
  const header = renderHeader(
    artifacts.length ? (
      <>
        <IconButton
          aria-pressed={searching}
          icon={<SearchIcon />}
          label={searching ? 'Close search' : 'Search artifacts'}
          onClick={() => (searching ? closeSearch() : setSearching(true))}
          size="sm"
          tooltipSide="bottom"
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-pressed={category !== 'all'}
              icon={<ListFilterIcon />}
              label="Filter artifacts"
              size="sm"
              tooltipSide="bottom"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Type</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) => setCategory(value as ArtifactCategory | 'all')}
              value={category}
            >
              <DropdownMenuRadioItem value="all">
                All types ({artifacts.length})
              </DropdownMenuRadioItem>
              {ARTIFACT_CATEGORIES.filter(
                (item) => counts.has(item.value) || item.value === category,
              ).map((item) => (
                <DropdownMenuRadioItem key={item.value} value={item.value}>
                  {item.label} ({counts.get(item.value) ?? 0})
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ) : undefined,
  );

  let body: ReactNode;
  if (artifactsPending && !artifacts.length)
    body = <StateView className="p-4" kind="loading" size="panel" title="Loading artifacts" />;
  else if (!artifacts.length)
    body = (
      <StateView
        className="p-4"
        detail={artifactsError}
        kind={artifactsError ? 'error' : 'empty'}
        size="panel"
        title={artifactsError ? 'Artifacts unavailable' : 'No artifacts in this conversation'}
      />
    );
  else if (!visible.length)
    body = (
      <StateView
        action={{
          label: 'Clear filters',
          onClick: () => {
            closeSearch();
            setCategory('all');
          },
        }}
        className="p-4"
        detail="Clear the search or show all types."
        kind="empty"
        size="panel"
        title="No artifacts match"
      />
    );
  else {
    const active = tabs.find((tab) => tab.id === activeTabId);
    // Made here comes first; versions this conversation only read, or that an
    // earlier one made, follow under Earlier.
    const here = visible.filter(
      (artifact) => artifact.session_id === sessionId && artifact.session_relation !== 'used',
    );
    const earlier = visible.filter((artifact) => !here.includes(artifact));
    const row = (artifact: ArtifactEntity) => {
      const name = artifactDisplayName(artifact);
      const selected = active?.kind === 'artifact' && active.artifact.id === artifact.id;
      const facts = [
        name,
        artifactEvidenceLabel(artifact),
        artifact.size !== undefined ? formatResourceSize(artifact.size) : undefined,
      ].filter(Boolean);
      return (
        <div key={artifact.id} role="listitem" title={facts.join(', ')}>
          <ListRow
            aria-current={selected || undefined}
            aria-label={`Open ${name}`}
            className="cursor-pointer text-[12.5px]"
            icon={<ArtifactTypeIcon artifact={artifact} className="size-3.5" />}
            meta={
              artifact.version !== undefined ? <MetaValue>v{artifact.version}</MetaValue> : null
            }
            onClick={() => onOpenArtifact(artifact)}
            onKeyDown={activateOnKey(() => onOpenArtifact(artifact))}
            role="button"
            selected={selected}
            tabIndex={0}
            title={name}
          />
        </div>
      );
    };
    body = (
      <div aria-label="Session artifacts" className="p-1" role="list">
        {here.length ? <GroupLabel>This conversation</GroupLabel> : null}
        {here.map(row)}
        {earlier.length ? <GroupLabel>Earlier</GroupLabel> : null}
        {earlier.map(row)}
      </div>
    );
  }

  return (
    <>
      {header}
      {searching ? (
        <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
          <Input
            aria-label="Search artifacts"
            autoFocus
            className="h-7 text-xs"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
              }
            }}
            placeholder="Search artifacts"
            value={query}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {body}
        {artifactsTruncated ? (
          <p className="px-3 py-1 text-[11px] text-warning">
            The service returned a partial artifact registry.
          </p>
        ) : null}
        {filtered && visible.length ? (
          <p aria-live="polite" className="sr-only">
            {visible.length} of {artifacts.length} artifacts
          </p>
        ) : null}
      </div>
    </>
  );
}

function TerminalList({
  tabs,
  activeTabId,
  onSelectTab,
  onOpenTerminal,
}: WorkbenchListColumnProps) {
  const terminals = tabs.filter((tab) => tab.kind === 'terminal');
  if (!onOpenTerminal && !terminals.length)
    return (
      <StateView
        className="p-4"
        detail="Terminals run in the desktop app, on this computer."
        kind="unavailable"
        size="panel"
        title="No terminal here"
      />
    );
  return (
    <Rows label="Terminals">
      {terminals.map((tab) => (
        <div key={tab.id} role="listitem" title={tab.label}>
          <ListRow
            aria-current={tab.id === activeTabId || undefined}
            className="cursor-pointer text-[12.5px]"
            icon={<TerminalSquareIcon />}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={activateOnKey(() => onSelectTab(tab.id))}
            role="button"
            selected={tab.id === activeTabId}
            tabIndex={0}
            title={tab.label}
          />
        </div>
      ))}
      {onOpenTerminal && !terminals.length ? (
        <div role="listitem">
          <ListRow
            className="cursor-pointer text-[12.5px] text-muted-foreground"
            icon={<AddIcon />}
            onClick={onOpenTerminal}
            onKeyDown={activateOnKey(onOpenTerminal)}
            role="button"
            tabIndex={0}
            title="Open a terminal"
          />
        </div>
      ) : null}
    </Rows>
  );
}

function BrowserList({
  sessionId,
  tabs,
  activeTabId,
  onOpenBrowserPage,
}: WorkbenchListColumnProps) {
  // Mounted only while this list shows, so its poll runs only then.
  const pages = useBrowserPages(sessionId);
  const rows = (pages.data ?? []).filter((page) => !page.closed);
  if (pages.isPending && sessionId)
    return <StateView className="p-4" kind="loading" size="panel" title="Loading pages" />;
  if (!sessionId || (pages.error && !rows.length))
    return (
      <StateView
        className="p-4"
        detail={pages.error?.message ?? 'Pages the agent opens appear here.'}
        kind={pages.error ? 'error' : 'empty'}
        size="panel"
        title={pages.error ? 'Pages unavailable' : 'No browser pages'}
      />
    );
  return (
    <Rows label="Browser pages">
      <BrowserNewPage onOpened={onOpenBrowserPage} sessionId={sessionId} startOpen={!rows.length} />
      {rows.map((page) => {
        const id = `browser:${page.id}`;
        const open = tabs.some((tab) => tab.id === id);
        return (
          <div key={page.id} role="listitem" title={page.url || browserPageLabel(page)}>
            <ListRow
              aria-current={activeTabId === id || undefined}
              badge={open ? <Tag tone="neutral">Open</Tag> : <span className="w-[58px]" />}
              className="cursor-pointer text-[12.5px]"
              description={page.host || 'Blank page'}
              icon={<GlobeIcon />}
              onClick={() => onOpenBrowserPage(page)}
              onKeyDown={activateOnKey(() => onOpenBrowserPage(page))}
              role="button"
              selected={activeTabId === id}
              tabIndex={0}
              title={browserPageLabel(page)}
            />
          </div>
        );
      })}
    </Rows>
  );
}
