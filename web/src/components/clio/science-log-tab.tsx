import type { ScienceEntry, ScienceStudy, ScienceView, SubagentRun } from '@clio/core/v3';
import { FocusIcon, GitForkIcon, ListIcon, SearchIcon } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useOpenTaskHandle } from '@/hooks/use-flow-run';
import { useRepository } from '@/hooks/use-repository';
import { useScienceLog } from '@/hooks/use-science-log';
import { activeA2uiOpenViewRuntime, useStudyViewFocus } from '@/lib/a2ui/open-view';
import { TRANSCRIPT_PAGE_SIZE } from '@/lib/runtime-limits';
import { useLiveStore } from '@/store/live-store';
import { FrameCommentsUnavailable } from './comments/frame-comments';
import { FileModeControls } from './file-mode-controls';
import { FrameTalkTake } from './file-viewer-take';
import { FrameBar, FrameCrumbs, type FrameCrumb } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import {
  backlinks,
  branchTitle,
  messageForCall,
  scienceEntryDomId,
  studyName,
  studyTopics,
  studyTree,
  studyViewDomId,
  type StudyTopic,
} from './science-log-model';
import { ScienceLogList } from './science-log-panel';
import type { ScienceFileReference } from './science-log-sources';
import { scienceLogTake } from './science-log-take';
import { StudyGraph } from './study-graph';
import { useStudyGraphLayout, type StudyGraphScope } from './study-graph-layout';
import { observationGroups } from './study-graph-model';
import { StudyTree } from './study-tree';
import { StudyViews } from './study-views';
import type { SubagentOpenTarget } from './subagent-card';
import { WorkbenchTabList, WorkbenchTabListToggle } from './workbench-tab-list';
import { WorkbenchTabListSlot, useWorkbenchTabListPicked } from './workbench-tab-list-context';

export interface ScienceLogTabProps {
  sessionId: string;
  workspaceId: string;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  /** Open a folder in the Files view. */
  onOpenFolder?: (path: string) => void;
}

/** The Science log tab: the study's log, its lineage graph, and the study beside the tabs. */
export function ScienceLogTab({
  sessionId,
  workspaceId,
  onOpenSubagent,
  onOpenFolder,
}: ScienceLogTabProps) {
  // While a branch runs, the attached dashboards may change between entries.
  const log = useScienceLog(sessionId);
  const openTask = useOpenTaskHandle(onOpenSubagent);
  const viewInTranscript = useTranscriptJump(sessionId, workspaceId);
  if (log.isPending) return <StateView kind="loading" title="Loading the study" />;
  if (log.error)
    return (
      <StateView
        detail={log.error.message}
        kind="error"
        title="The science log could not be read"
      />
    );
  if (!log.data.in_study)
    return <StateView kind="empty" title="This session is not part of a study" />;
  return (
    <ScienceLogView
      key={sessionId}
      onOpenFolder={onOpenFolder}
      onOpenTask={(handle) => openTask.mutate({ handle, target: 'canvas' })}
      onViewCall={(session, callId) => void viewInTranscript(session, callId)}
      onViewInTranscript={(entry) =>
        void viewInTranscript(entry.session || entry.branch, entry.invocation)
      }
      sessionId={sessionId}
      study={log.data}
      views={log.data.views.length ? <StudyViews study={log.data} /> : undefined}
    />
  );
}

export interface ScienceLogViewProps {
  study: ScienceStudy;
  /** The session the tab belongs to; a branch's own topic is picked first. */
  sessionId: string;
  onOpenTask?: (handle: string) => void;
  onOpenFolder?: (path: string) => void;
  onViewInTranscript?: (entry: ScienceEntry) => void;
  /** Scroll the transcript to a call an entry cites (a source or an analysis). */
  onViewCall?: (sessionId: string, callId: string) => void;
  /** A link to a cited file, when this surface carries it. */
  fileHref?: (file: ScienceFileReference) => string | undefined;
  /** Whether a node folder can be opened here; without it every folder opens. */
  folderAvailable?: (path: string) => boolean;
  /** One of the study's attached views, shown in place when it is opened from the list. */
  views?: ReactNode;
}

type LogMode = 'log' | 'graph';
/** What the log shows: the whole study, one topic, one experiment's observations, or a view. */
type LogFilter =
  | { kind: 'all' }
  | { kind: 'topic'; key: string }
  | { kind: 'group'; id: string }
  | { kind: 'view'; entry: string };

const MODES = [
  { value: 'log', label: 'Log', icon: ListIcon },
  { value: 'graph', label: 'Study graph', icon: GitForkIcon },
] as const;

/**
 * Each study's chosen mode for this browser tab, so a remounted tab (maximizing the canvas)
 * opens where the person left it. A per-viewer convenience: without storage it is the log.
 */
const studyModeKey = (study: string) => `clio.science-log.mode.${study}`;
function chosenStudyMode(study: string): LogMode {
  try {
    return window.sessionStorage.getItem(studyModeKey(study)) === 'graph' ? 'graph' : 'log';
  } catch {
    return 'log'; // storage blocked: the default mode
  }
}
function chooseStudyMode(study: string, mode: LogMode): void {
  try {
    window.sessionStorage.setItem(studyModeKey(study), mode);
  } catch {
    // storage blocked: the choice lasts until the tab remounts
  }
}

/** A message can reference files, artifacts and sessions, not a study's entries. */
const NO_MESSAGE_REFERENCE = {
  reason: 'Science log entries cannot be added to a message yet',
  onSelect: () => undefined,
};

const DASHBOARD_ARTIFACT = /^artifact_[A-Za-z0-9_-]+$/u;

/** The log and its graph share the selected entry; the study list narrows both to a topic. */
export function ScienceLogView({
  study,
  sessionId,
  onOpenTask,
  onOpenFolder,
  onViewInTranscript,
  onViewCall,
  fileHref,
  folderAvailable,
  views,
}: ScienceLogViewProps) {
  const tree = useMemo(() => studyTree(study), [study]);
  const topics = useMemo(() => studyTopics(study, tree), [study, tree]);
  const name = useMemo(() => studyName(study), [study]);
  const byId = useMemo(() => new Map(study.entries.map((entry) => [entry.id, entry])), [study]);
  const titles = useMemo(
    () => new Map(study.branches.map((branch) => [branch.session_id, branchTitle(branch)])),
    [study],
  );
  const cited = useMemo(() => backlinks(study.entries), [study]);
  const groups = useMemo(() => observationGroups(study), [study]);
  const [filter, setFilter] = useState<LogFilter>(() =>
    sessionId !== tree.branch && topics.some((topic) => topic.node.key === `branch:${sessionId}`)
      ? { kind: 'topic', key: `branch:${sessionId}` }
      : { kind: 'all' },
  );
  const [selected, setSelected] = useState<string>();
  const [revealed, setRevealed] = useState<{ id: string; at: number }>();
  const [mode, setModeState] = useState<LogMode>(() => chosenStudyMode(study.study));
  const setMode = (next: LogMode) => {
    chooseStudyMode(study.study, next);
    setModeState(next);
  };
  const [scope, setScope] = useState<StudyGraphScope>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const picked = useWorkbenchTabListPicked();
  const slot = useContext(WorkbenchTabListSlot);

  const topic =
    filter.kind === 'topic' ? topics.find((row) => row.node.key === filter.key) : undefined;
  const shownIds = useMemo(() => {
    if (filter.kind === 'group') return groups.get(filter.id) ?? [];
    return (topic ?? topics[0])?.entries ?? [];
  }, [filter, groups, topic, topics]);
  const shown = useMemo(
    () => shownIds.map((id) => byId.get(id)).filter((entry) => entry !== undefined),
    [byId, shownIds],
  );
  const entry = selected ? byId.get(selected) : undefined;

  /** Follow a citation or a graph node to its entry in the log, widening the log when it is outside. */
  const revealEntry = useCallback(
    (id: string) => {
      if (!byId.has(id)) return;
      if (!shownIds.includes(id)) setFilter({ kind: 'all' });
      setSelected(id);
      setRevealed({ id, at: Date.now() });
    },
    [byId, shownIds],
  );
  useEffect(() => {
    if (!revealed || mode !== 'log') return;
    // After the filter change renders: bring the entry into view without animation.
    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(scienceEntryDomId(revealed.id));
      row?.scrollIntoView?.({ block: 'nearest' });
      row?.querySelector<HTMLElement>('[data-entry-row]')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revealed, mode]);

  const pickTopic = (row: StudyTopic) => {
    setFilter(row.depth === 0 ? { kind: 'all' } : { kind: 'topic', key: row.node.key });
    if (selected && !row.entries.includes(selected)) setSelected(undefined);
    picked();
  };
  const openView = (view: ScienceView) => {
    const runtime = activeA2uiOpenViewRuntime();
    // A published dashboard opens as its own Dashboard tab; an older surface view opens here.
    if (
      runtime &&
      view.kind === 'dashboard' &&
      view.artifact_id &&
      DASHBOARD_ARTIFACT.test(view.artifact_id)
    )
      runtime.openView(`artifact://${view.artifact_id}`);
    else if (views) useStudyViewFocus.getState().focus(view.entry);
    picked();
  };
  // `openView` from any surface (or the list) asks for one of this study's views: shown once per ask.
  const requestedView = useStudyViewFocus((state) => state.entry);
  const request = useStudyViewFocus((state) => state.nonce);
  const [answered, setAnswered] = useState<number>();
  if (
    views &&
    requestedView &&
    request !== answered &&
    study.views.some((view) => view.entry === requestedView)
  ) {
    setAnswered(request);
    setFilter({ kind: 'view', entry: requestedView });
    // The view replaces the log until another row of the list is picked.
    if (mode !== 'log') setMode('log');
  }
  useEffect(() => {
    if (answered !== undefined) useStudyViewFocus.getState().clear();
  }, [answered]);
  useEffect(() => {
    // Runs after the view has rendered, so its panel is in the page.
    if (filter.kind === 'view' && mode === 'log')
      document.getElementById(studyViewDomId(filter.entry))?.scrollIntoView?.({ block: 'start' });
  }, [filter, mode]);

  const graph = useStudyGraphLayout(study, selected, scope, mode === 'graph');
  const openedView =
    filter.kind === 'view' ? study.views.find((view) => view.entry === filter.entry) : undefined;
  const crumbs: FrameCrumb[] =
    filter.kind === 'all'
      ? [{ label: 'Science log' }]
      : [
          { label: 'Science log', onSelect: () => setFilter({ kind: 'all' }) },
          {
            label:
              filter.kind === 'topic'
                ? (topic?.node.title ?? 'Topic')
                : filter.kind === 'group'
                  ? `${shown.length} observations`
                  : openedView?.title || 'Untitled view',
          },
        ];
  const take = scienceLogTake({
    study,
    shown,
    entry,
    topic: topic?.node,
    ...(mode === 'graph' && selected
      ? {
          onShowInLog: () => {
            setMode('log');
            if (groups.has(selected)) {
              setFilter({ kind: 'group', id: selected });
              setSelected(undefined);
            } else revealEntry(selected);
          },
        }
      : {}),
    onViewInTranscript,
    onOpenTask,
    onOpenFolder,
    folderAvailable,
  });
  const selectedKey =
    filter.kind === 'all'
      ? tree.key
      : filter.kind === 'topic'
        ? filter.key
        : filter.kind === 'view'
          ? `view:${filter.entry}`
          : undefined;
  const studyRows = (
    <StudyTree
      name={name}
      onOpenView={views || study.views.some((view) => view.artifact_id) ? openView : undefined}
      onSelectTopic={pickTopic}
      query={searching ? query : ''}
      selected={selectedKey}
      topics={topics}
      views={study.views}
    />
  );
  const list = searching ? (
    <>
      <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
        <Input
          aria-label="Search the study"
          autoFocus
          className="h-7 text-xs"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setSearching(false);
            setQuery('');
          }}
          placeholder="Search the study"
          value={query}
        />
      </div>
      {studyRows}
    </>
  ) : (
    studyRows
  );
  const searchToggle = (
    <IconButton
      aria-pressed={searching}
      icon={<SearchIcon />}
      label={searching ? 'Close search' : 'Search the study'}
      onClick={() => {
        setSearching(!searching);
        setQuery('');
      }}
      size="sm"
      tooltipSide="bottom"
    />
  );
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <Tabs
      className="flex h-full min-h-0 min-w-0 flex-col gap-0"
      onValueChange={(value) => setMode(value === 'graph' ? 'graph' : 'log')}
      value={mode}
    >
      <FrameBar
        actions={
          <FrameTalkTake
            addToMessage={NO_MESSAGE_REFERENCE}
            comments={<FrameCommentsUnavailable reason="Not available for the science log" />}
            copy={take.copy}
            open={take.open}
          />
        }
        format={
          <>
            <FileModeControls
              label="Science log views"
              modes={MODES}
              onChange={(value) => setMode(value === 'graph' ? 'graph' : 'log')}
              value={mode}
            />
            {mode === 'graph' ? (
              <IconButton
                aria-pressed={scope === 'linked'}
                className="[&_svg]:size-3.5"
                disabledReason={selected ? undefined : 'Select an entry first'}
                icon={<FocusIcon aria-hidden="true" />}
                label="Only the selected entry and its links"
                onClick={() => setScope(scope === 'linked' ? 'all' : 'linked')}
              />
            ) : null}
            <WorkbenchTabListToggle />
          </>
        }
        label="Science log"
        what={
          mode === 'graph' && graph ? (
            <>
              <span className="tabular-nums" data-frame-position="">
                {count(graph.entryCount, 'entry', 'entries')}
              </span>
              <span className="tabular-nums">{count(graph.linkCount, 'link', 'links')}</span>
            </>
          ) : filter.kind === 'view' ? undefined : (
            <span className="tabular-nums" data-frame-position="">
              {count(shown.length, 'entry', 'entries')}
            </span>
          )
        }
        where={<FrameCrumbs parts={crumbs} />}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        {slot ? null : (
          <aside
            aria-label="Study"
            className="w-56 shrink-0 overflow-y-auto border-r max-sm:hidden"
          >
            {list}
          </aside>
        )}
        <TabsContent className="min-h-0 min-w-0 flex-1 overflow-y-auto" value="log">
          {filter.kind === 'view' ? (
            <div className="min-w-0 p-4">{views}</div>
          ) : shown.length ? (
            <ScienceLogList
              backlinks={cited}
              byId={byId}
              entries={shown}
              fileHref={fileHref}
              onPickEntry={(id) => setSelected((current) => (current === id ? undefined : id))}
              onSelectEntry={revealEntry}
              onViewCall={onViewCall}
              selectedEntry={selected}
              titles={titles}
            />
          ) : (
            <StateView
              kind="empty"
              title={
                filter.kind === 'all'
                  ? 'This study has written no entries yet'
                  : 'No entries here yet'
              }
            />
          )}
        </TabsContent>
        <TabsContent className="min-h-0 min-w-0 flex-1" value="graph">
          {graph && !graph.empty ? (
            <StudyGraph graph={graph} onSelectEntry={setSelected} selectedEntry={selected} />
          ) : (
            <StateView kind="empty" title="No entries to graph yet" />
          )}
        </TabsContent>
      </div>
      {slot ? (
        <WorkbenchTabList actions={searchToggle} title="Study">
          {list}
        </WorkbenchTabList>
      ) : null}
    </Tabs>
  );
}

/**
 * Scroll the transcript to a recorded tool call (the one that wrote an entry, or
 * one an entry cites): in this session
 * through the transcript's own `#message-…/activity-…` anchor, in another branch
 * by opening that session at the same anchor.
 */
function useTranscriptJump(sessionId: string, workspaceId: string) {
  const navigate = useNavigate();
  const repository = useRepository();
  return useCallback(
    async (session: string, callId: string) => {
      if (!session || !callId) return;
      const loaded = Object.values(useLiveStore.getState().entities.messages);
      let messageId = messageForCall(loaded, session, callId);
      if (!messageId) {
        try {
          // Page back from the newest messages until the call is found; only one
          // page is held at a time, never the whole conversation.
          let before: string | undefined;
          for (;;) {
            const page = await repository.transcript(session, undefined, {
              limit: TRANSCRIPT_PAGE_SIZE,
              before,
            });
            messageId = messageForCall(page.messages, session, callId);
            if (messageId || !page.next_cursor || page.next_cursor === before) break;
            before = page.next_cursor;
          }
        } catch {
          messageId = undefined;
        }
      }
      if (!messageId) {
        toast.error('That tool call is not in the transcript.');
        return;
      }
      const hash = `#message-${encodeURIComponent(messageId)}/activity-${encodeURIComponent(callId)}`;
      if (session === sessionId) {
        if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else window.location.hash = hash;
        return;
      }
      navigate(
        `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(session)}${hash}`,
      );
    },
    [navigate, repository, sessionId, workspaceId],
  );
}
