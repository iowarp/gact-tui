import type {
  Artifact,
  AsyncProcess,
  ExecutionProvenanceResult,
  Message,
  PendingInteraction,
  Run,
  SessionDiff,
  SubagentRun,
  Task,
  ToolInvocation,
  WorkspaceResource,
} from '@clio/core/v3';
import { createContext, useContext, useDeferredValue, useMemo, type ReactNode } from 'react';
import { useLiveStore } from '@/store/live-store';
import type { TaskPageControls } from './async-task-list';
import { sessionSources } from './observability-evidence-sources';
import { useSessionWork } from './use-session-work';
import { activityItems, type ActivityItem } from './workbench-activity-model';

/** The session records Activity reads, handed down once by the workspace. */
export interface WorkbenchActivitySource {
  sessionId: string;
  tools: readonly ToolInvocation[];
  processes: readonly AsyncProcess[];
  subagents: readonly SubagentRun[];
  runs: readonly Run[];
  tasks: readonly Task[];
  interactions: readonly PendingInteraction[];
  diffs: readonly SessionDiff[];
  artifacts: readonly Artifact[];
  resources: readonly WorkspaceResource[];
  executionProvenance?: ExecutionProvenanceResult;
  /** Finished tasks load on request; their rows join the list once shown. */
  workPages?: TaskPageControls;
  onCancelTask?: (task: AsyncProcess) => Promise<void>;
  onControlTask?: (task: AsyncProcess, action: 'pause' | 'resume' | 'restart') => Promise<void>;
  onOpenFlow?: (handle: string, title: string) => void;
}

const ActivitySourceContext = createContext<WorkbenchActivitySource | undefined>(undefined);

export function WorkbenchActivityProvider({
  source,
  children,
}: {
  source: WorkbenchActivitySource;
  children: ReactNode;
}) {
  const {
    sessionId,
    tools,
    processes,
    subagents,
    runs,
    tasks,
    interactions,
    diffs,
    artifacts,
    resources,
    executionProvenance,
    workPages,
    onCancelTask,
    onControlTask,
    onOpenFlow,
  } = source;
  // One value per change of an actual record list, not per parent render.
  const value = useMemo(
    () => ({
      sessionId,
      tools,
      processes,
      subagents,
      runs,
      tasks,
      interactions,
      diffs,
      artifacts,
      resources,
      executionProvenance,
      workPages,
      onCancelTask,
      onControlTask,
      onOpenFlow,
    }),
    [
      sessionId,
      tools,
      processes,
      subagents,
      runs,
      tasks,
      interactions,
      diffs,
      artifacts,
      resources,
      executionProvenance,
      workPages,
      onCancelTask,
      onControlTask,
      onOpenFlow,
    ],
  );
  return <ActivitySourceContext.Provider value={value}>{children}</ActivitySourceContext.Provider>;
}

const NONE: readonly never[] = [];
const NO_MESSAGES: Record<string, Message> = {};

// oxlint-disable-next-line react/only-export-components
export function useWorkbenchActivitySource(): WorkbenchActivitySource | undefined {
  return useContext(ActivitySourceContext);
}

/** The finished tasks a reader asked to see join the live ones, once each. */
function withHistory(source: WorkbenchActivitySource): readonly AsyncProcess[] {
  const history = source.workPages?.history;
  if (!history?.visible || !history.items.length) return source.processes;
  const handle = (task: AsyncProcess) => task.handle ?? task.handle_id ?? task.id;
  const live = new Set(source.processes.map(handle));
  return [...source.processes, ...history.items.filter((task) => !live.has(handle(task)))];
}

/**
 * The Activity rows, derived only while a list or detail tab that shows them
 * is mounted. `sources` adds the cited sources, which read the transcript.
 */
// oxlint-disable-next-line react/only-export-components
export function useActivityItems(
  source: WorkbenchActivitySource,
  { sources: withSources = true }: { sources?: boolean } = {},
): readonly ActivityItem[] {
  const { sessionId } = source;
  const work = useSessionWork(sessionId);
  // Citations live in messages, which change on every streamed word; read them
  // at low priority so typing and scrolling never wait on this list.
  const messageMap = useLiveStore((state) =>
    withSources ? state.entities.messages : NO_MESSAGES,
  ) as Record<string, Message>;
  const deferredMessages = useDeferredValue(messageMap);
  const messages = useMemo(
    () => Object.values(deferredMessages).filter((message) => message.session_id === sessionId),
    [deferredMessages, sessionId],
  );
  const processes = useMemo(() => withHistory(source), [source]);
  const sources = useMemo(
    () =>
      withSources
        ? sessionSources(
            messages,
            processes,
            source.resources,
            source.executionProvenance,
            source.artifacts,
          )
        : NONE,
    [messages, processes, source, withSources],
  );
  return useMemo(
    () =>
      activityItems({
        tools: source.tools,
        processes,
        subagents: source.subagents,
        runs: source.runs,
        tasks: source.tasks,
        interactions: source.interactions,
        diffs: source.diffs,
        artifacts: source.artifacts,
        sources,
        work: work.data,
      }),
    [processes, source, sources, work.data],
  );
}

/** Without a workspace source (a bare workbench), the child agents it has still list. */
// oxlint-disable-next-line react/only-export-components
export function fallbackActivityItems(subagents: readonly SubagentRun[]): readonly ActivityItem[] {
  return activityItems({
    tools: NONE,
    processes: NONE,
    subagents: subagents.filter((subagent) => subagent.child_session_id),
    runs: NONE,
    tasks: NONE,
    interactions: NONE,
    diffs: NONE,
    artifacts: NONE,
  });
}
