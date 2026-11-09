import type {
  Artifact as ArtifactEntity,
  BrowserPage,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import { GlobeIcon, PanelRightCloseIcon, PaperclipIcon, TerminalSquareIcon } from 'lucide-react';
import { memo, type KeyboardEvent, type ReactNode } from 'react';
import { artifactEvidenceLabel } from '@/lib/artifact-presentation';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { formatCompactBytes, formatResourceSize } from '@/lib/format';
import { AddIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { ArtifactFilters } from './artifact-filters';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { Tag, MetaValue } from './primitives/tag';
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
  return (
    <section
      aria-label={`${title} list`}
      data-slot="workbench-list"
      data-overlay={overlay || undefined}
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-l border-border bg-background',
        // Too narrow for both: the list is a sheet over the whole tab body
        // (never half of it, which would clip the tab), and a pick closes it.
        overlay
          ? 'absolute top-10 right-10 bottom-0 left-0 z-20 border-t border-l-0'
          : 'h-full w-[clamp(200px,34%,280px)]',
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
          renderHeader={(actions) => <ListHeader actions={actions} onHide={onHide} title={title} />}
          sessionId={props.sessionId}
          subagents={props.subagents}
          tabs={props.tabs}
          workspaceId={props.workspaceId}
        />
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
      return <FilesList {...props} />;
    case 'sources':
      return <SourcesList {...props} />;
    case 'artifacts':
      return <ArtifactsList {...props} />;
    case 'activity':
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
}: WorkbenchListColumnProps) {
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
  tabs,
  activeTabId,
}: WorkbenchListColumnProps) {
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
  artifacts,
  artifactsPending,
  artifactsError,
  artifactsTruncated,
  onOpenArtifact,
  tabs,
  activeTabId,
}: WorkbenchListColumnProps) {
  if (artifactsPending && !artifacts.length)
    return <StateView className="p-4" kind="loading" size="panel" title="Loading artifacts" />;
  if (!artifacts.length)
    return (
      <StateView
        className="p-4"
        detail={artifactsError}
        kind={artifactsError ? 'error' : 'empty'}
        size="panel"
        title={artifactsError ? 'Artifacts unavailable' : 'No artifacts in this conversation'}
      />
    );
  const active = tabs.find((tab) => tab.id === activeTabId);
  // Every retained version is a row; a version column appears once a name repeats.
  const names = new Map<string, number>();
  for (const artifact of artifacts) {
    const name = artifactDisplayName(artifact);
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  const versioned = [...names.values()].some((count) => count > 1);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-1.5">
      <ArtifactFilters artifacts={artifacts}>
        {(visible) => (
          <div aria-label="Session artifacts" role="list">
            {visible.map((artifact) => {
              const name = artifactDisplayName(artifact);
              return (
                <div
                  key={artifact.id}
                  role="listitem"
                  title={
                    artifact.size !== undefined
                      ? `${name}, ${formatResourceSize(artifact.size)}`
                      : name
                  }
                >
                  <ListRow
                    aria-label={`Open ${name}`}
                    aria-current={
                      active?.kind === 'artifact' && active.artifact.id === artifact.id
                        ? true
                        : undefined
                    }
                    className="cursor-pointer text-[12.5px]"
                    columns={
                      versioned ? (
                        <span className="w-7 shrink-0 text-right font-mono text-[11px] text-faint tabular-nums">
                          {(names.get(name) ?? 0) > 1 && artifact.version !== undefined
                            ? `v${artifact.version}`
                            : null}
                        </span>
                      ) : undefined
                    }
                    badge={<ArtifactRoleTag artifact={artifact} />}
                    icon={<ArtifactTypeIcon artifact={artifact} className="size-4" />}
                    meta={
                      artifact.size !== undefined ? (
                        <MetaValue>{formatCompactBytes(artifact.size)}</MetaValue>
                      ) : (
                        <span className="w-11" />
                      )
                    }
                    onClick={() => onOpenArtifact(artifact)}
                    onKeyDown={activateOnKey(() => onOpenArtifact(artifact))}
                    role="button"
                    selected={active?.kind === 'artifact' && active.artifact.id === artifact.id}
                    tabIndex={0}
                    title={name}
                  />
                </div>
              );
            })}
          </div>
        )}
      </ArtifactFilters>
      {artifactsTruncated ? (
        <p className="px-2 py-1 text-xs text-warning">
          The service returned a partial artifact registry.
        </p>
      ) : null}
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
  if (!rows.length)
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

/** Short words for the fixed badge column; the full evidence label is on hover. */
const ARTIFACT_ROLE_TAGS: Record<string, string> = {
  Verification: 'Review',
  Intermediate: 'Interim',
};

function ArtifactRoleTag({ artifact }: { artifact: ArtifactEntity }) {
  const label = artifactEvidenceLabel(artifact);
  return (
    <span title={label}>
      <Tag tone="neutral">{ARTIFACT_ROLE_TAGS[label] ?? label}</Tag>
    </span>
  );
}
