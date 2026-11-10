import type { Message, SubagentRun, ToolInvocation } from '@clio/core/v3';
import { ActivityIcon, BracesIcon, GitForkIcon } from 'lucide-react';
import { lazy, Suspense, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDuration } from '@/lib/format';
import { ClioContextCanvasPanel } from './context-canvas-panel';
import {
  asyncProcessDetail,
  agentInteractionActivityItems,
  childProjectionActivityItems,
  ClioActivityTimeline,
  type ObservabilityActivityItem,
} from './observability-activity';
import { ClioActivityTimelineList } from './activity-timeline-list';
import { ActivityRecordFooter, ProvenanceSourceBar } from './observability-provenance';
import { WorkspaceFoldersBar } from './workspace-folders';
import { ClioStatus } from './status';
import { getToolActivityTitle, getToolStatus, getToolSummary } from './tool-presentation';
import type { SubagentOpenTarget } from './subagent-card';

import type { ObservabilityView } from './observability-view-storage';
export type { ObservabilityView } from './observability-view-storage';
import {
  OBSERVABILITY_VIEWS,
  observabilityViewStorageKey,
  restoredObservabilityView,
} from './observability-view-storage';
import { ObservabilityViewControl } from './observability-view-control';

import type { ClioObservabilityDockProps } from './observability-dock-shell';
import { ResourceLoading } from './resource-states';
export { ClioObservabilityDock, type ClioObservabilityDockProps } from './observability-dock-shell';

// React Flow and its layout code load when the relationships view first opens.
const ConversationRelationships = lazy(() =>
  import('./conversation-relationships').then((module) => ({
    default: module.ConversationRelationships,
  })),
);

export function ClioObservabilityView({
  workspaceFolders,
  contextFiles,
  contextFrames,
  messages,
  processes,
  tools,
  runs,
  subagents,
  context,
  contextError,
  contextFilesError,
  contextFilesPending,
  contextFramesError,
  contextFramesPending,
  contextTargets,
  processesError,
  processesPending,
  selectedContextTargetId,
  compactContextPending,
  contextPreferencesPending,
  onCompactContext,
  onContextTargetChange,
  onUpdateContextPreferences,
  onOpenFile,
  onOpenResource,
  onOpenSubagent,
  executionProvenance,
  provenanceProviders,
  artifactProvenanceProvider,
  provenanceProvider,
  provenancePending,
  provenanceDegradation,
  onProvenanceProviderChange,
  resources,
  sessionId,
  sessions,
  onOpenArtifact,
  requestedView,
  views,
  interactions = [],
}: ClioObservabilityDockProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  // A host that owns the view switch (the workbench's Activity tab) names the view.
  const control = useContext(ObservabilityViewControl);
  const [chosenView, setActiveView] = useState<ObservabilityView>(
    () => requestedView?.view ?? restoredObservabilityView(sessionId),
  );
  // The selected conversation survives switching views, not switching sessions.
  const [selected, setSelected] = useState<{ sessionId?: string; id: string }>();
  const selectedId = selected?.sessionId === sessionId ? selected?.id : undefined;
  const offered = (view: ObservabilityView) => !views || views.includes(view);
  const activeView =
    control?.view ?? (views && !views.includes(chosenView) ? views[0] : chosenView);
  // Reset the restored view when the session identity itself changes, without
  // an effect: adjusting state from a prop change during render (rather than
  // in a post-commit effect) avoids the extra render-then-reset flash.
  const [viewedSessionId, setViewedSessionId] = useState(sessionId);
  const [viewedRequestKey, setViewedRequestKey] = useState(requestedView?.key);
  if (sessionId !== viewedSessionId) {
    setViewedSessionId(sessionId);
    setViewedRequestKey(requestedView?.key);
    setActiveView(requestedView?.view ?? restoredObservabilityView(sessionId));
  } else if (requestedView && requestedView.key !== viewedRequestKey) {
    setViewedRequestKey(requestedView.key);
    setActiveView(requestedView.view);
  }
  useLayoutEffect(() => {
    if (!requestedView) return;
    if (sessionId)
      window.localStorage.setItem(observabilityViewStorageKey(sessionId), requestedView.view);
  }, [requestedView, sessionId]);
  const toolTurnContext = useMemo(() => toolActivityContext(messages), [messages]);
  const subagentTurnContext = useMemo(() => subagentActivityContext(messages), [messages]);
  const waitTurnContext = useMemo(
    () => waitActivityContext(tools, toolTurnContext),
    [toolTurnContext, tools],
  );
  const activity = useMemo<ObservabilityActivityItem[]>(() => {
    const projected = executionProvenance?.session_lineage;
    const lineageBySession = new Map(projected?.map((owner) => [owner.session_id, owner]) ?? []);
    const processByOwner = new Map(
      processes
        .filter(
          (process) =>
            process.kind === 'agent' && (process.owner_session_id || process.child_session_id),
        )
        .map((process) => [process.owner_session_id ?? process.child_session_id!, process]),
    );
    const knownToolIds = new Set(tools.map((tool) => tool.id));
    const items: ObservabilityActivityItem[] = [
      ...runs.map(
        (run): ObservabilityActivityItem => ({
          id: run.id,
          kind: 'run',
          label: run.summary || `Run ${run.id.slice(0, 8)}`,
          detail:
            run.elapsed_ms === undefined
              ? 'Agent run'
              : `${formatDuration(run.elapsed_ms)} elapsed`,
          state: run.state,
          at: run.completed_at ?? run.started_at,
          timing: run.completed_at || run.started_at ? 'event' : undefined,
        }),
      ),
      ...tools.flatMap((tool): ObservabilityActivityItem[] => {
        const eventAt = tool.completed_at ?? tool.started_at;
        const turnContext = toolTurnContext.get(tool.id);
        const process = processByOwner.get(tool.session_id);
        const owner = lineageBySession.get(tool.session_id);
        // Delegation is already represented by the branch-open lifecycle nodes.
        // Keeping a timestamp-less spawn tool beside those nodes repeats the same
        // event and can sort it away from the delegation it caused.
        if (
          !turnContext &&
          (((tool.name === 'spawn_agent_task' || tool.name === 'spawn_agents_parallel') &&
            processes.some((candidate) => candidate.kind === 'agent')) ||
            // A started flow is its process row, labelled as the flow's run.
            ((tool.name === 'run_flow' || tool.name === 'run_workflow') &&
              processes.some((candidate) => candidate.flow)))
        ) {
          return [];
        }
        return [
          {
            id: tool.id,
            kind: 'tool',
            label: getToolActivityTitle(tool),
            detail: getToolSummary(tool),
            state: getToolStatus(tool),
            at: eventAt ?? turnContext?.at,
            groupId: turnContext?.turnId,
            timing: eventAt ? 'event' : turnContext ? 'turn' : undefined,
            transcriptMessageId: turnContext?.messageId,
            rootSessionId: executionProvenance?.root_session_id ?? executionProvenance?.session_id,
            ownerSessionId: tool.session_id,
            ownerLabel: owner?.label,
            parentSessionId: owner?.parent_session_id,
            taskId: process?.id ?? owner?.task_id,
            taskPath: process?.task_path ?? owner?.task_path,
            depth: owner?.depth ?? process?.task_path?.length,
            causalOrder: turnContext?.causalOrder,
            causalMessageId: turnContext?.messageId,
          },
        ];
      }),
      // An empty session_lineage ([]) is a legal "no children" answer, not a
      // missing read — it must still fall back to the plain processes list, or
      // every background process renders zero rows here.
      ...(projected && projected.length > 0
        ? childProjectionActivityItems(executionProvenance, processes, knownToolIds, onOpenFile)
        : processes.map(
            (process): ObservabilityActivityItem => ({
              id: process.id,
              kind: 'process',
              label: process.title,
              detail: asyncProcessDetail(process),
              state: process.live_state,
              at: process.updated_at ?? process.created_at,
              groupId:
                process.parent_turn_id ??
                (process.kind === 'mcp-task' ? `mcp-task:${process.id}` : undefined),
              timing: process.updated_at || process.created_at ? 'event' : undefined,
              rootSessionId: process.root_session_id,
              ownerSessionId: process.child_session_id ?? process.owner_session_id,
              ownerLabel: process.title,
              parentSessionId: process.parent_session_id,
              taskId: process.id,
              taskPath: process.task_path,
              depth: process.depth ?? process.task_path?.length,
            }),
          )),
      ...agentInteractionActivityItems(
        interactions,
        processes,
        executionProvenance?.root_session_id ?? executionProvenance?.session_id,
      ),
    ];
    return items
      .map((item) => {
        const lifecycleContext =
          item.taskId && item.lifecycle && item.lifecycle !== 'event'
            ? subagentTurnContext.get(`${item.taskId}:${item.lifecycle}`)
            : undefined;
        const waitContext =
          item.taskId && item.lifecycle === 'close' ? waitTurnContext.get(item.taskId) : undefined;
        const orderedItem = waitContext
          ? {
              ...item,
              causalOrder: waitContext.causalOrder - 0.5,
              causalMessageId: waitContext.messageId,
              transcriptMessageId: item.transcriptMessageId ?? waitContext.messageId,
            }
          : lifecycleContext
            ? {
                ...item,
                causalOrder: lifecycleContext.causalOrder,
                causalMessageId: lifecycleContext.messageId,
                transcriptMessageId: item.transcriptMessageId ?? lifecycleContext.messageId,
              }
            : item;
        const subagent = findSubagent(subagents, item.taskId, item.ownerSessionId);
        return subagent && onOpenSubagent
          ? {
              ...orderedItem,
              onOpen: (target: SubagentOpenTarget) => onOpenSubagent(subagent, target),
            }
          : orderedItem;
      })
      .sort((left, right) => {
        const byTime = (right.at ?? '').localeCompare(left.at ?? '');
        return byTime;
      });
  }, [
    executionProvenance,
    interactions,
    onOpenFile,
    onOpenSubagent,
    processes,
    subagentTurnContext,
    runs,
    subagents,
    toolTurnContext,
    tools,
    waitTurnContext,
  ]);

  const turnStartedAt = useMemo(
    () =>
      runs.reduce<string | undefined>(
        (latest, run) =>
          run.started_at && (!latest || run.started_at > latest) ? run.started_at : latest,
        undefined,
      ),
    [runs],
  );
  const selectView = (value: string) => {
    if (!OBSERVABILITY_VIEWS.has(value as ObservabilityView)) return;
    const next = value as ObservabilityView;
    setActiveView(next);
    if (sessionId) {
      window.localStorage.setItem(observabilityViewStorageKey(sessionId), next);
    }
  };
  const provenanceBar = (
    <>
      <ProvenanceSourceBar
        execution={executionProvenance}
        artifactProvider={artifactProvenanceProvider}
        degradation={provenanceDegradation}
        onProviderChange={onProvenanceProviderChange}
        pending={provenancePending}
        provider={provenanceProvider}
        providers={provenanceProviders}
      />
      <WorkspaceFoldersBar folders={workspaceFolders} />
    </>
  );
  const relationshipsView = (
    <Suspense fallback={<ResourceLoading label="Loading relationships" />}>
      <ConversationRelationships
        sessions={sessions ?? []}
        sessionId={sessionId ?? ''}
        onOpenArtifact={onOpenArtifact}
        selectedId={selectedId}
        onSelect={(id) => setSelected({ sessionId, id })}
      />
    </Suspense>
  );
  const contextView = (
    <>
      <SectionState
        error={contextFilesError}
        label="Attached context"
        pending={contextFilesPending}
      />
      <SectionState
        error={contextFramesError}
        label="Context frames"
        pending={contextFramesPending}
      />
      <ClioContextCanvasPanel
        compactPending={compactContextPending}
        context={context}
        error={contextError}
        files={contextFiles}
        frames={contextFrames}
        resources={resources}
        onOpenResource={onOpenResource}
        tools={tools}
        messages={messages}
        onCompact={onCompactContext}
        onOpenFile={onOpenFile}
        onTargetChange={onContextTargetChange}
        onUpdatePreferences={onUpdateContextPreferences}
        preferencesPending={contextPreferencesPending}
        selectedTargetId={selectedContextTargetId}
        targets={contextTargets}
      />
    </>
  );
  // The workbench's Activity tab: its own header, then the view, with no second row of tabs.
  if (control?.renderHeader) {
    const renderHeader = control.renderHeader;
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col" ref={surfaceRef}>
        {activeView === 'activity' ? (
          <ClioActivityTimelineList
            footer={
              <ActivityRecordFooter
                artifactProvider={artifactProvenanceProvider}
                degradation={provenanceDegradation}
                execution={executionProvenance}
                folders={workspaceFolders}
                onProviderChange={onProvenanceProviderChange}
                pending={provenancePending}
                provider={provenanceProvider}
                providers={provenanceProviders}
              />
            }
            items={activity}
            messages={messages}
            notice={
              processesError || processesPending ? (
                <div className="border-b px-3 py-1.5">
                  <SectionState
                    error={processesError}
                    label="Background work"
                    pending={processesPending}
                  />
                </div>
              ) : null
            }
            renderHeader={renderHeader}
            turnStartedAt={turnStartedAt}
          />
        ) : (
          <>
            {renderHeader(null)}
            <ScrollArea className="min-h-0 min-w-0 flex-1">
              {activeView === 'relationships' ? (
                <div className="min-w-0">{relationshipsView}</div>
              ) : (
                <div className="grid gap-4 p-4">{contextView}</div>
              )}
            </ScrollArea>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="@container/obs h-full min-h-0 min-w-0" ref={surfaceRef}>
      <Tabs className="h-full min-h-0 gap-0" onValueChange={selectView} value={activeView}>
        {control ? null : (
          <TabsList
            aria-label="Observability view"
            variant="line"
            className="no-scrollbar h-9 w-full shrink-0 justify-start gap-0 overflow-x-auto overflow-y-hidden rounded-none border-b px-1.5 py-0 group-data-horizontal/tabs:h-9"
          >
            {offered('activity') ? (
              <ObservabilityTab
                icon={<ActivityIcon className="size-3.5" />}
                label="Timeline"
                value="activity"
              />
            ) : null}
            {offered('relationships') ? (
              <ObservabilityTab
                icon={<GitForkIcon className="size-3.5" />}
                label="Relationships"
                value="relationships"
              />
            ) : null}
            {offered('context') ? (
              <ObservabilityTab
                icon={<BracesIcon className="size-3.5" />}
                label="Context"
                value="context"
              />
            ) : null}
          </TabsList>
        )}
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <TabsContent className="m-0 grid gap-2 p-4" value="activity">
            {provenanceBar}
            <SectionState
              error={processesError}
              label="Background work"
              pending={processesPending}
            />
            <ClioActivityTimeline items={activity} messages={messages} />
          </TabsContent>
          <TabsContent className="m-0 min-w-0" value="relationships">
            {relationshipsView}
          </TabsContent>
          <TabsContent className="m-0 grid gap-4 p-4" value="context">
            {contextView}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

/** States an observability section the service could not deliver, or has not delivered yet. */
function SectionState({
  error,
  label,
  pending,
}: {
  error?: string;
  label: string;
  pending?: boolean;
}) {
  if (error)
    return <ClioStatus detail={error} label={`${label} unavailable`} value="unavailable" />;
  if (pending) return <ClioStatus label={`Loading ${label.toLowerCase()}`} value="connecting" />;
  return null;
}

function ObservabilityTab({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <TabsTrigger
      aria-label={label}
      className="h-full min-w-max flex-none shrink-0 gap-1 px-2 text-xs focus-visible:ring-inset group-data-horizontal/tabs:after:bottom-0"
      title={label}
      value={value}
    >
      {icon}
      {/* A narrow pocket keeps only the selected view's name; the rest show their icon. */}
      <span className="hidden @[20rem]/obs:inline [[data-state=active]>&]:inline">{label}</span>
    </TabsTrigger>
  );
}

interface TranscriptActivityContext {
  at: string;
  causalOrder: number;
  messageId: string;
  turnId?: string;
}

function orderedMessageBlocks(message: Message) {
  return message.blocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => {
      const leftSequence = left.block.sequence ?? left.index;
      const rightSequence = right.block.sequence ?? right.index;
      return leftSequence - rightSequence || left.index - right.index;
    });
}

function toolActivityContext(messages: readonly Message[]): Map<string, TranscriptActivityContext> {
  const context = new Map<string, TranscriptActivityContext>();
  let turnId: string | undefined;
  let causalOrder = 0;
  for (const message of [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )) {
    if (message.role === 'user') turnId = message.id;
    for (const { block } of orderedMessageBlocks(message)) {
      causalOrder += 1;
      if (block.type === 'tool')
        context.set(block.tool_id, {
          at: message.created_at,
          causalOrder,
          messageId: message.id,
          turnId,
        });
    }
  }
  return context;
}

function subagentActivityContext(
  messages: readonly Message[],
): Map<string, TranscriptActivityContext> {
  const context = new Map<string, TranscriptActivityContext>();
  let turnId: string | undefined;
  let causalOrder = 0;
  for (const message of [...messages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )) {
    if (message.role === 'user') turnId = message.id;
    for (const { block } of orderedMessageBlocks(message)) {
      causalOrder += 1;
      if (block.type !== 'subagent') continue;
      const lifecycle = block.stage === 'delegate.started' ? 'open' : 'close';
      context.set(`${block.subagent_id}:${lifecycle}`, {
        at: message.created_at,
        causalOrder,
        messageId: message.id,
        turnId,
      });
    }
  }
  return context;
}

function waitActivityContext(
  tools: readonly ToolInvocation[],
  toolContext: ReadonlyMap<string, TranscriptActivityContext>,
): Map<string, TranscriptActivityContext> {
  const context = new Map<string, TranscriptActivityContext>();
  for (const tool of tools) {
    if (tool.name !== 'wait_agent_tasks') continue;
    const waitContext = toolContext.get(tool.id);
    if (!waitContext || !tool.input || typeof tool.input !== 'object') continue;
    const taskIds = Reflect.get(tool.input, 'task_ids');
    if (!Array.isArray(taskIds)) continue;
    for (const taskId of taskIds) {
      if (typeof taskId === 'string') context.set(taskId, waitContext);
    }
  }
  return context;
}

function findSubagent(
  subagents: readonly SubagentRun[],
  taskId?: string,
  ownerSessionId?: string,
): SubagentRun | undefined {
  return subagents.find(
    (candidate) =>
      Boolean(taskId && candidate.id === taskId) ||
      Boolean(ownerSessionId && candidate.child_session_id === ownerSessionId),
  );
}
