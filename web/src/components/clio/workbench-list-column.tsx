import type {
  Artifact as ArtifactEntity,
  BrowserPage,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  DatabaseIcon,
  GlobeIcon,
  ListFilterIcon,
  PanelRightCloseIcon,
  PaperclipIcon,
  SearchIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import { memo, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
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
import { formatCompactBytes, formatResourceSize } from '@/lib/format';
import { AddIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { ConnectedSourcePicker } from './connected-source-picker';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { Tag, MetaValue } from './primitives/tag';
import { BrowserNewPage } from './browser-new-page';
import { browserPageLabel, useBrowserPages } from './use-browser-pages';
import { WorkbenchActivityList } from './workbench-activity-list';
import { FileBrowser } from './workbench-resource-browser';
import type { WorkbenchListView } from './workbench-strip';
import type { WorkbenchTab } from './workbench-shared';

const WORKBENCH_LIST_TITLES: Record<WorkbenchListView, string> = {
  files: 'Files',
  sources: 'Sources',
  artifacts: 'Artifacts',
  activity: 'Activity',
  terminal: 'Terminal',
  browser: 'Browser pages',
};

export interface WorkbenchListColumnProps {
  view: WorkbenchListView;
  /** Narrow panel: the list lies over the tab and hides after a pick. */
  overlay: boolean;
  onHide: () => void;
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
  /** Activity rows open their details, a change or Work as a tab. */
  onOpenTab: (tab: WorkbenchTab) => void;
  onOpenSubagent: (subagent: SubagentRun) => void;
  // Terminal and Browser
  onOpenTerminal?: () => void;
  onOpenBrowserPage: (page: BrowserPage) => void;
}

/**
 * The list beside the tabs, chosen on the strip. A row opens its item as a
 * tab; the list stays (or, over a narrow panel, steps aside).
 */
export const WorkbenchListColumn = memo(function WorkbenchListColumn(
  props: WorkbenchListColumnProps,
) {
  const { view, overlay, onHide } = props;
  const title = WORKBENCH_LIST_TITLES[view];
  const renderHeader = (actions: ReactNode) => (
    <ListHeader actions={actions} onHide={onHide} title={title} />
  );
  return (
    <section
      aria-label={`${title} list`}
      data-slot="workbench-list"
      data-overlay={overlay || undefined}
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-l border-border bg-sidebar',
        // Too narrow for both: the list is a sheet over the whole tab area, its
        // header in the tab row's place (never half of it, which would clip the
        // tab), and a pick closes it.
        overlay
          ? 'absolute inset-y-0 right-11 left-0 z-20 border-l-0'
          : 'h-full w-[36%] min-w-[180px]',
      )}
    >
      {view === 'activity' ? (
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
      ) : view === 'files' ? (
        <FilesList {...props} renderHeader={renderHeader} />
      ) : view === 'artifacts' ? (
        <ArtifactsList {...props} renderHeader={renderHeader} />
      ) : view === 'sources' ? (
        <SourcesList {...props} renderHeader={renderHeader} />
      ) : (
        <>
          <ListHeader onHide={onHide} title={title} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ListBody {...props} />
          </div>
        </>
      )}
    </section>
  );
});

function ListHeader({
  title,
  actions,
  onHide,
}: {
  title: string;
  actions?: ReactNode;
  onHide: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border pr-1 pl-3.5">
      <h2 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-muted-foreground">
        {title}
      </h2>
      {actions}
      <IconButton
        icon={<PanelRightCloseIcon />}
        label={`Hide ${title}`}
        onClick={onHide}
        size="sm"
        tooltipSide="bottom"
      />
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
        />
      </div>
      {changedPaths.size ? (
        <p className="flex h-7 shrink-0 items-center gap-1.5 truncate border-t border-border px-2.5 text-[11px] whitespace-nowrap text-faint">
          <span className="font-medium text-changed">Teal</span>
          <span className="truncate">changed in this conversation</span>
        </p>
      ) : null}
    </div>
  );
}

/** Enter and Space open a row, like a click. */
function activateOnKey(open: () => void) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  };
}

function Rows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-label={label} className="h-full overflow-y-auto p-1" role="list">
      {children}
    </div>
  );
}

function SourcesList({
  resources,
  resourcesPending,
  resourcesError,
  onOpenResource,
  onRefreshFiles,
  tabs,
  activeTabId,
  workspaceId,
  sessionId,
  renderHeader,
}: WorkbenchListColumnProps & { renderHeader: (actions: ReactNode) => ReactNode }) {
  const [managing, setManaging] = useState(false);
  return (
    <>
      {renderHeader(
        <IconButton
          icon={<DatabaseIcon />}
          label="Manage sources"
          onClick={() => setManaging(true)}
          size="sm"
          tooltipSide="bottom"
        />,
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <SourceRows
          activeTabId={activeTabId}
          onOpenResource={onOpenResource}
          resources={resources}
          resourcesError={resourcesError}
          resourcesPending={resourcesPending}
          tabs={tabs}
        />
      </div>
      <ConnectedSourcePicker
        manageOnly
        onChanged={onRefreshFiles}
        onOpenChange={setManaging}
        open={managing}
        sessionId={sessionId}
        workspaceId={workspaceId}
      />
    </>
  );
}

function SourceRows({
  resources,
  resourcesPending,
  resourcesError,
  onOpenResource,
  tabs,
  activeTabId,
}: Pick<
  WorkbenchListColumnProps,
  'resources' | 'resourcesPending' | 'resourcesError' | 'onOpenResource' | 'tabs' | 'activeTabId'
>) {
  if (resourcesPending && !resources.length)
    return <StateView className="p-4" kind="loading" size="panel" title="Loading sources" />;
  if (!resources.length)
    return (
      <StateView
        className="p-4"
        detail={resourcesError}
        kind={resourcesError ? 'error' : 'empty'}
        size="panel"
        title={resourcesError ? 'Sources unavailable' : 'No sources in this workspace'}
      />
    );
  const active = tabs.find((tab) => tab.id === activeTabId);
  return (
    <Rows label="Workspace sources">
      {resources.map((resource) => {
        const uploading = resource.state === 'uploading';
        const progress = resource.declared_size
          ? Math.round((resource.received_size / resource.declared_size) * 100)
          : 0;
        return (
          <SourceRow
            key={resource.id}
            onOpen={() => onOpenResource(resource)}
            progress={uploading ? progress : undefined}
            resource={resource}
            selected={active?.kind === 'resource' && active.resource.id === resource.id}
          />
        );
      })}
    </Rows>
  );
}

function SourceRow({
  resource,
  progress,
  selected,
  onOpen,
}: {
  resource: WorkspaceResource;
  progress?: number;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <div role="listitem" title={`${resource.name}, ${formatResourceSize(resource.received_size)}`}>
      <ListRow
        aria-current={selected || undefined}
        aria-label={`Open ${resource.name}`}
        badge={
          progress !== undefined ? (
            <Tag tone="info">{`${progress}%`}</Tag>
          ) : resource.state !== 'ready' ? (
            <Tag tone="neutral">{resource.state}</Tag>
          ) : undefined
        }
        className="cursor-pointer text-[12.5px]"
        icon={<PaperclipIcon />}
        meta={<MetaValue>{formatCompactBytes(resource.received_size)}</MetaValue>}
        onClick={onOpen}
        onKeyDown={activateOnKey(onOpen)}
        role="button"
        selected={selected}
        tabIndex={0}
        title={resource.name}
      />
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

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-7 items-end px-2 pb-1 text-[11px] font-semibold text-muted-foreground"
      role="listitem"
    >
      {children}
    </div>
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
