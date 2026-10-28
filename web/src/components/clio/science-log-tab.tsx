import type { ScienceEntry, ScienceStudy, SubagentRun } from '@clio/core/v3';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LayoutGridIcon, ListIcon, NetworkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useOpenTaskHandle } from '@/hooks/use-flow-run';
import { useRepository } from '@/hooks/use-repository';
import { useScienceLog } from '@/hooks/use-science-log';
import { useLiveStore } from '@/store/live-store';
import {
  backlinks,
  branchEntries,
  branchTitle,
  messageForCall,
  scienceEntryDomId,
  studyViewDomId,
  studyTree,
  type StudyNode,
} from './science-log-model';
import { ScienceLogPanel } from './science-log-panel';
import type { ScienceFileReference } from './science-log-sources';
import { StudyTree } from './study-tree';
import { StudyViews } from './study-views';
import { useStudyViewFocus } from '@/lib/a2ui/open-view';
import { StudyGraph, type StudyGraphScope } from './study-graph';
import { observationGroups } from './study-graph-model';
import type { SubagentOpenTarget } from './subagent-card';

export interface ScienceLogTabProps {
  sessionId: string;
  workspaceId: string;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  /** Open a folder in the Files view. */
  onOpenFolder?: (path: string) => void;
}

/** The Science log tab: the study tree above, the selected branch's log below. */
export function ScienceLogTab({
  sessionId,
  workspaceId,
  onOpenSubagent,
  onOpenFolder,
}: ScienceLogTabProps) {
  // While a branch runs, the attached dashboards may change between entries.
  const log = useScienceLog(sessionId, true, true);
  const openTask = useOpenTaskHandle(onOpenSubagent);
  const viewInTranscript = useTranscriptJump(sessionId, workspaceId);
  if (log.isPending) return <p className="p-4 text-sm text-muted-foreground">Loading the study…</p>;
  if (log.error)
    return (
      <p className="p-4 text-sm text-destructive" role="alert">
        The science log could not be read: {log.error.message}
      </p>
    );
  if (!log.data.in_study)
    return (
      <p className="p-4 text-sm text-muted-foreground">This session is not part of a study.</p>
    );
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
  /** The session the tab belongs to; its branch is selected first. */
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
  /** The study's attached views; the Views mode shows only when there are some. */
  views?: ReactNode;
}

/** List and graph views share entry selection, citations and the original record renderer. */
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
  const byId = useMemo(() => new Map(study.entries.map((entry) => [entry.id, entry])), [study]);
  const titles = useMemo(
    () => new Map(study.branches.map((branch) => [branch.session_id, branchTitle(branch)])),
    [study],
  );
  const cited = useMemo(() => backlinks(study.entries), [study]);
  const initial = study.branches.some((branch) => branch.session_id === sessionId)
    ? sessionId
    : tree.branch;
  const [selectedBranch, setSelectedBranch] = useState(initial);
  const [focusedEntry, setFocusedEntry] = useState<string>();
  const [studyView, setStudyView] = useState<'views' | 'list' | 'graph'>('list');
  // Views, the list and the graph each get the whole tab rather than sharing it.
  const mode = studyView === 'views' && !views ? 'list' : studyView;
  const groups = useMemo(() => observationGroups(study), [study]);
  const [selectedGroup, setSelectedGroup] = useState<string>();
  const groupEntries = useMemo(
    () =>
      (selectedGroup ? (groups.get(selectedGroup) ?? []) : [])
        .map((id) => byId.get(id))
        .filter((entry) => entry !== undefined),
    [byId, groups, selectedGroup],
  );
  const [graphScope, setGraphScope] = useState<StudyGraphScope>('linked');
  const selectedEntry = byId.get(focusedEntry || '') ?? byId.get(study.study) ?? study.entries[0];
  const selectEntry = useCallback(
    (entryId: string) => {
      const entry = byId.get(entryId);
      if (!entry) return;
      if (entry.branch) setSelectedBranch(entry.branch);
      setSelectedGroup(undefined);
      setFocusedEntry(entryId);
    },
    [byId],
  );
  const selectGraphNode = useCallback(
    (id: string) => (groups.has(id) ? setSelectedGroup(id) : selectEntry(id)),
    [groups, selectEntry],
  );
  const selectNode = (node: StudyNode) => {
    setSelectedBranch(node.branch);
    setFocusedEntry(node.entry);
  };
  useEffect(() => {
    if (!focusedEntry || mode !== 'list') return;
    // After the branch switch renders: bring the entry into view without animation.
    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(scienceEntryDomId(focusedEntry));
      card?.scrollIntoView?.({ block: 'nearest' });
      card?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedEntry, selectedBranch, mode]);
  const entries = useMemo(
    () => branchEntries(study.entries, selectedBranch),
    [selectedBranch, study.entries],
  );
  const [openedView, setOpenedView] = useState<string>();
  // The tree's links ask as any surface's `openView` does, so Views shows that view.
  const openView = useCallback((entry: string) => useStudyViewFocus.getState().focus(entry), []);
  // `openView` from any surface asks for one of this study's views: shown once per ask.
  const requestedView = useStudyViewFocus((state) => state.entry);
  const request = useStudyViewFocus((state) => state.nonce);
  const [answered, setAnswered] = useState<number>();
  if (
    requestedView &&
    request !== answered &&
    study.views.some((view) => view.entry === requestedView)
  ) {
    setAnswered(request);
    setStudyView('views');
    setOpenedView(requestedView);
  }
  useEffect(() => {
    if (answered !== undefined) useStudyViewFocus.getState().clear();
  }, [answered]);
  useEffect(() => {
    // Runs after Views has rendered, so the opened view's panel is in the page.
    if (openedView && mode === 'views')
      document.getElementById(studyViewDomId(openedView))?.scrollIntoView?.({ block: 'start' });
  }, [openedView, mode]);
  return (
    <div className="@container/science-log flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-auto p-3 [&>*]:shrink-0">
      <ToggleGroup
        aria-label="Study view"
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value) setStudyView(value as typeof studyView);
        }}
        variant="outline"
        size="sm"
        spacing={0}
      >
        {views ? (
          <ToggleGroupItem value="views">
            <LayoutGridIcon aria-hidden="true" />
            Views
          </ToggleGroupItem>
        ) : null}
        <ToggleGroupItem value="list">
          <ListIcon aria-hidden="true" />
          List
        </ToggleGroupItem>
        <ToggleGroupItem value="graph">
          <NetworkIcon aria-hidden="true" />
          Graph
        </ToggleGroupItem>
      </ToggleGroup>
      {mode === 'views' ? (
        <div className="min-w-0">{views}</div>
      ) : mode === 'graph' ? (
        <div className="grid min-w-0 items-start gap-4 @min-[58rem]/science-log:grid-cols-[minmax(0,1fr)_21rem]">
          <StudyGraph
            study={study}
            selectedEntry={selectedGroup ?? selectedEntry?.id}
            onSelectEntry={selectGraphNode}
            scope={graphScope}
            onScopeChange={setGraphScope}
          />
          {selectedGroup && groupEntries.length ? (
            <aside
              aria-label="Record inspector"
              className="grid max-h-[46rem] min-w-0 gap-3 overflow-auto rounded-md border bg-card p-3"
            >
              <ScienceLogPanel
                heading={`${groupEntries.length} observations`}
                showSelection={false}
                backlinks={cited}
                branchTitle={titles.get(groupEntries[0].branch) || groupEntries[0].branch}
                byId={byId}
                entries={groupEntries}
                onSelectEntry={selectEntry}
                fileHref={fileHref}
                onViewCall={onViewCall}
                onViewInTranscript={onViewInTranscript}
                titles={titles}
              />
            </aside>
          ) : selectedEntry ? (
            <aside
              aria-label="Record inspector"
              className="grid min-w-0 gap-3 rounded-md border bg-card p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-xs text-muted-foreground">
                  {titles.get(selectedEntry.branch) || selectedEntry.branch}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    selectEntry(selectedEntry.id);
                    setStudyView('list');
                  }}
                >
                  <ListIcon aria-hidden="true" />
                  Show in list
                </Button>
              </div>
              <ScienceLogPanel
                heading="Selected record"
                showSelection={false}
                backlinks={cited}
                branchTitle={titles.get(selectedEntry.branch) || selectedEntry.branch}
                byId={byId}
                entries={[selectedEntry]}
                focusedEntry={selectedEntry.id}
                onSelectEntry={selectEntry}
                fileHref={fileHref}
                onViewCall={onViewCall}
                onViewInTranscript={onViewInTranscript}
                titles={titles}
              />
            </aside>
          ) : null}
        </div>
      ) : (
        <>
          <StudyTree
            folderAvailable={folderAvailable}
            onOpenFolder={onOpenFolder}
            onOpenTask={onOpenTask}
            onSelect={selectNode}
            onSelectEntry={selectEntry}
            onOpenView={views ? openView : undefined}
            root={tree}
            selectedBranch={selectedBranch}
            views={study.views}
          />
          <ScienceLogPanel
            backlinks={cited}
            branchTitle={titles.get(selectedBranch) || selectedBranch}
            byId={byId}
            entries={entries}
            focusedEntry={focusedEntry}
            onSelectEntry={selectEntry}
            fileHref={fileHref}
            onViewCall={onViewCall}
            onViewInTranscript={onViewInTranscript}
            titles={titles}
          />
        </>
      )}
    </div>
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
          messageId = messageForCall(
            (await repository.transcript(session)).messages,
            session,
            callId,
          );
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
