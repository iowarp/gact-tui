import { subagentOpenTarget } from './subagent-navigation';
import { countWorkNeedingInspection } from './workspace-route-state';
import type { TaskPageControls } from './async-task-list';
import type {
  Artifact,
  AsyncProcess,
  ContextFile,
  ContextFrame,
  ContextSnapshot,
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
  Message,
  PendingInteraction,
  Run,
  RunState,
  Session,
  SessionDiff,
  SubagentRun,
  Task,
  ToolInvocation,
  UsageSnapshot,
  ProvenanceProviderSummary,
  ArtifactProvenanceProviderSummary,
  WorkspaceResource,
  WorkspaceSourceFolder,
} from '@clio/core/v3';
import { artifactDeliverables } from '@/lib/artifact-presentation';
import {
  BoxesIcon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  PanelRightOpenIcon,
  PanelRightDashedIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useId, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { failedWorkCount, railButtonLook, type RailButtonLook } from './rail-button-look';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ClioContextTarget } from '@/lib/context-targets';
import {
  getPresentationOverrideCount,
  subscribePresentationOverrides,
} from '@/lib/presentation-overrides';
import { getChildAgentAssignment } from './child-agent-presentation';
import { ClioInteractiveRow } from './interactive-row';
import { ConversationRail, type ConversationRailControl } from './conversation-rail';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { ClioStatus, clioStatusLabel, type ClioStatusValue } from './status';
import { getToolPresentation } from './tool-presentation';
import type { SubagentOpenTarget } from './subagent-card';
import type { ObservabilityView } from './observability-view-storage';

import type { ClioWorkbenchOpenRequest } from './workbench-open-request';

export interface ClioObservabilityDockProps {
  /** Opens a shared browser page in the workbench (the Work rail's Browser pages). */
  onOpenBrowser?: (request: Extract<ClioWorkbenchOpenRequest, { kind: 'browser' }>) => void;
  sessions?: readonly Session[];
  familyProvenance?: ExecutionProvenanceResult;
  familyProvenancePending?: boolean;
  onLoadFamilyProvenance?: () => void;
  artifacts: readonly Artifact[];
  contextFiles: readonly ContextFile[];
  contextFrames: readonly ContextFrame[];
  diffs: readonly SessionDiff[];
  messages: readonly Message[];
  interactions?: readonly PendingInteraction[];
  /** The workspace's folders (its own and those the person allowed), for Evidence. */
  workspaceFolders?: readonly WorkspaceSourceFolder[];
  processes: readonly AsyncProcess[];
  workPages?: TaskPageControls;
  onCancelTask?: (task: AsyncProcess) => Promise<void>;
  onControlTask?: (task: AsyncProcess, action: 'pause' | 'resume' | 'restart') => Promise<void>;
  tasks: readonly Task[];
  tools: readonly ToolInvocation[];
  runs: readonly Run[];
  subagents: readonly SubagentRun[];
  context?: ContextSnapshot;
  /** What this conversation has used so far: tokens sent and received, and cost. */
  usage?: UsageSnapshot;
  contextError?: string;
  contextFilesError?: string;
  contextFilesPending?: boolean;
  contextFramesError?: string;
  contextFramesPending?: boolean;
  diffsError?: string;
  diffsPending?: boolean;
  processesError?: string;
  processesPending?: boolean;
  contextTargets?: readonly ClioContextTarget[];
  selectedContextTargetId?: string;
  compactContextPending?: boolean;
  contextPreferencesPending?: boolean;
  onCompactContext?: () => Promise<unknown>;
  onContextTargetChange?: (targetId: string) => void;
  onUpdateContextPreferences?: (input: {
    automatic_compaction?: boolean;
    autocompact_pct?: number;
  }) => Promise<unknown>;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  /** Open a flow run's view: a task that runs a flow opens its run, not a chat. */
  onOpenFlow?: (handle: string, title: string) => void;
  onOpenCanvas?: (view?: ObservabilityView) => void;
  requestedView?: { key: string; view: ObservabilityView };
  /** The views offered; the workbench lists evidence and the timeline in Activity instead. */
  views?: readonly ObservabilityView[];
  onOpenWork?: () => void;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenDiff?: (diff: SessionDiff) => void;
  onOpenFile?: (path: string) => void;
  onOpenResource?: (resource: WorkspaceResource) => void;
  sessionState?: RunState;
  sessionId?: string;
  workspaceId?: string;
  surfaceRef?: RefObject<HTMLElement | null>;
  toolbar?: boolean;
  executionProvenance?: ExecutionProvenanceResult;
  provenanceProviders?: readonly ProvenanceProviderSummary[];
  artifactProvenanceProvider?: ArtifactProvenanceProviderSummary;
  provenanceProvider?: string;
  provenancePending?: boolean;
  provenanceDegradation?: ExecutionProvenanceDegradation;
  onProvenanceProviderChange?: (provider: string) => void;
  resources?: readonly WorkspaceResource[];
}

function isActiveWork(state: string): boolean {
  return [
    'queued',
    'running',
    'working',
    'input_required',
    'waiting_permission',
    'waiting_user',
  ].includes(state);
}

export function ClioObservabilityDock(props: ClioObservabilityDockProps) {
  const [childAgentsOpen, setChildAgentsOpen] = useState(false);
  const presentationOverrideCount = useSyncExternalStore(
    subscribePresentationOverrides,
    () => (props.sessionId ? getPresentationOverrideCount(props.sessionId) : 0),
    () => 0,
  );
  const activityCount = props.processes.length || props.subagents.length;
  const unresolvedWorkCount = countWorkNeedingInspection(props.processes);
  const activeActivityCount = props.processes.length
    ? props.processes.filter((process) => isActiveWork(process.live_state)).length
    : props.subagents.filter((agent) => isActiveWork(agent.state)).length;
  const currentTool = props.tools.findLast((tool) => ['pending', 'running'].includes(tool.state));
  const currentTask = props.tasks.findLast((task) => ['queued', 'running'].includes(task.state));
  const latestActiveProcess = props.processes.findLast((process) =>
    isActiveWork(process.live_state),
  );
  const sessionActive = props.sessionState === 'queued' || props.sessionState === 'running';
  const sessionNeedsAttention =
    props.sessionState === 'waiting_permission' ||
    props.sessionState === 'waiting_user' ||
    props.sessionState === 'failed';
  const showDockStatusBadge = Boolean(
    activeActivityCount || sessionActive || sessionNeedsAttention || activityCount,
  );
  const dockStatusValue: ClioStatusValue = unresolvedWorkCount
    ? 'task_state_uncertain'
    : (props.sessionState ?? 'running');
  const activityCountLabel = `${activityCount.toLocaleString()} background ${activityCount === 1 ? 'activity' : 'activities'}`;
  const outputArtifacts = artifactDeliverables(props.artifacts).filter(
    (artifact) => artifact.session_relation !== 'used',
  );
  const dockLabel = currentTool
    ? getToolPresentation(currentTool).title
    : latestActiveProcess
      ? latestActiveProcess.title
      : currentTask
        ? currentTask.title
        : activityCount
          ? activityCountLabel
          : outputArtifacts.length
            ? `${outputArtifacts.length} outputs`
            : 'Activity';
  // The badge takes the session state's tone (red for failed), so its words must name that
  // same state: an idle fall-through label under a failed tone read as a red "Up to date".
  const dockStatus = unresolvedWorkCount
    ? 'Needs inspection'
    : activeActivityCount
      ? `${activeActivityCount} active`
      : sessionActive
        ? 'Working'
        : sessionNeedsAttention && props.sessionState
          ? clioStatusLabel(props.sessionState)
          : activityCount
            ? 'Settled'
            : 'No active work';


  const openChildAgent = (subagent: SubagentRun, target: SubagentOpenTarget) => {
    props.onOpenSubagent?.(subagent, target);
    setChildAgentsOpen(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1" data-slot="composer-evidence">
      <ConversationRail evidence={props}>
        {(rail) => (
          <RailButton
            rail={rail}
            toolbar={props.toolbar}
            failedCount={failedWorkCount(props.processes, props.subagents)}
            look={(seenFailed) =>
              railButtonLook({
                processes: props.processes,
                subagents: props.subagents,
                interactions: props.interactions,
                seenFailed,
              })
            }
          >
            <span
              className={
                props.toolbar
                  ? 'sr-only'
                  : 'hidden min-w-0 max-w-40 truncate text-left font-medium @min-[50rem]/composer:inline'
              }
            >
              {dockLabel}
            </span>
            {!props.toolbar && presentationOverrideCount ? (
              <ClioStatus
                className="hidden py-0.5 @min-[65rem]/composer:inline-flex"
                label={`${presentationOverrideCount} display ${presentationOverrideCount === 1 ? 'fallback' : 'fallbacks'}`}
                value="degraded"
              />
            ) : null}
            {!props.toolbar && showDockStatusBadge ? (
              <ClioStatus className="shrink-0 py-0.5" label={dockStatus} value={dockStatusValue} />
            ) : null}
          </RailButton>
        )}
      </ConversationRail>
      {/* Always mounted (not conditionally toggled) so it exists before its text changes, and
          outside the Button so its content never factors into the Button's accessible name. */}
      <span aria-live="polite" className="sr-only">
        {dockStatus}
      </span>
      {!props.toolbar && props.subagents.length ? (
        <Popover onOpenChange={setChildAgentsOpen} open={childAgentsOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label="Browse child conversations"
              className="size-7 shrink-0 p-0 text-muted-foreground"
              size="icon-sm"
              title="Browse child conversations"
              type="button"
              variant="ghost"
            >
              <BoxesIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-2"
            side="top"
          >
            <PopoverHeader className="px-2 pb-1 pt-1">
              <PopoverTitle>Child agents</PopoverTitle>
              <PopoverDescription>
                Select one to open a workspace tab. Shift-click to open it in the center.
              </PopoverDescription>
            </PopoverHeader>
            <div className="grid gap-1">
              {props.subagents.map((agent) => {
                const assignment = getChildAgentAssignment(agent);
                return (
                  <ClioInteractiveRow
                    actions={
                      agent.child_session_id && props.onOpenSubagent ? (
                        <Button
                          aria-label={`Open ${agent.title} in canvas`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openChildAgent(agent, 'canvas');
                          }}
                          size="icon"
                          title="Open in canvas"
                          type="button"
                          variant="ghost"
                        >
                          <PanelRightOpenIcon aria-hidden="true" />
                        </Button>
                      ) : undefined
                    }
                    className="min-h-0 px-2 py-2"
                    disabled={!agent.child_session_id || !props.onOpenSubagent}
                    key={agent.id}
                    onClick={(event) => openChildAgent(agent, subagentOpenTarget(event))}
                    onKeyDown={(event) => {
                      if (
                        event.shiftKey &&
                        (event.key === 'Enter' || event.key === ' ') &&
                        agent.child_session_id &&
                        props.onOpenSubagent
                      ) {
                        event.preventDefault();
                        openChildAgent(agent, 'conversation');
                      }
                    }}
                    onMouseDown={(event) => {
                      if (event.shiftKey) event.preventDefault();
                    }}
                    role="button"
                    running={agent.state === 'running'}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <BoxesIcon
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0 text-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-xs font-medium">{agent.title}</p>
                          <ClioStatus className="ml-auto shrink-0 py-0.5" value={agent.state} />
                        </div>
                        <p
                          className="mt-0.5 truncate text-[11px] text-muted-foreground"
                          title={assignment.detail ?? assignment.label}
                        >
                          {assignment.label}
                        </p>
                      </div>
                    </div>
                  </ClioInteractiveRow>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * Pins the conversation rail. Its key opens the rail at Running (or its first
 * row) and, pressed again, closes it.
 */
function RailButton({
  rail,
  toolbar,
  look,
  failedCount,
  children,
}: {
  rail: ConversationRailControl;
  toolbar?: boolean;
  look: (seenFailed: number) => RailButtonLook;
  failedCount: number;
  children: ReactNode;
}) {
  const { open, setOpen, buttonRef, panelId, panelRef } = rail;
  // Failed work stays red until the person has had the rail open on it.
  const [seenFailed, setSeenFailed] = useState(0);
  if ((open || failedCount < seenFailed) && seenFailed !== failedCount) setSeenFailed(failedCount);
  const current = look(seenFailed);
  const describedBy = useId();
  useShortcut('conversation-runs', () => {
    if (open) return setOpen(false);
    setOpen(true);
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      // The first run, else the Running row, else the rail's first row.
      const running = panel?.querySelectorAll<HTMLElement>(
        '[aria-label="Running section"] [data-rail-row]',
      );
      (
        running?.[1] ??
        running?.[0] ??
        panel?.querySelector<HTMLElement>('[data-rail-row]')
      )?.focus();
    });
  });
  return (
    <Button
      ref={buttonRef}
      aria-label="Conversation rail"
      aria-describedby={toolbar ? describedBy : undefined}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={() => setOpen(!open)}
      className={cn(
        'h-7 min-w-0 gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground',
        // Fixed slots, so the button keeps its width whatever it shows. A phone's
        // top bar has no room for empty slots, so an idle button is just its icon.
        toolbar && 'w-[3.25rem] justify-end gap-1 px-1.5',
        toolbar && current.kind === 'idle' && 'max-sm:w-7 max-sm:justify-center',
      )}
      data-rail-look={toolbar ? current.kind : undefined}
      size="sm"
      title={`${toolbar ? `${current.label}. ` : ''}${open ? 'Close' : 'Open'} the conversation rail`}
      type="button"
      variant="ghost"
    >
      {toolbar ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'flex size-3 shrink-0 items-center justify-center',
              current.kind === 'idle' && 'max-sm:hidden',
            )}
          >
            {current.kind === 'running' ? (
              <LoaderCircleIcon className="size-3 text-primary motion-safe:animate-spin" />
            ) : current.kind === 'waiting' ? (
              <MessageCircleQuestionIcon className="size-3 text-warning" />
            ) : current.kind === 'failed' ? (
              <TriangleAlertIcon className="size-3 text-destructive" />
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'w-3.5 shrink-0 text-center text-[11px] tabular-nums',
              current.kind === 'idle' && 'max-sm:hidden',
              current.kind === 'waiting' && 'text-warning',
              current.kind === 'failed' && 'text-destructive',
            )}
          >
            {current.count ? (current.count > 99 ? '99+' : current.count) : ''}
          </span>
          <span className="sr-only" id={describedBy}>
            {current.label}
          </span>
        </>
      ) : null}
      <PanelRightDashedIcon aria-hidden="true" />
      {children}
    </Button>
  );
}
