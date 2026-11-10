import { isToolAnchoredQuestion } from '@/lib/inline-question';
import { WrenchIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type {
  Artifact,
  ClioRepository,
  PendingInteraction,
  PendingInteractionResponse,
  SubagentRun,
  ToolInvocation,
} from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { ClioStatus } from './status';
import { TranscriptTaskRow } from './transcript-task-row';
import { isToolStopped } from './tool-presentation';
import {
  ClioAgentMessageLine,
  ClioSubagentLifecycleLine,
  type SubagentOpenTarget,
} from './subagent-card';
import { subagentsForTool } from './subagent-tool-link';
import { ClioToolInvocation } from './tool-invocation';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import {
  permissionInteractionForTool,
  questionInteractionsForTool,
  splitWaitingQuestion,
} from './agent-answer-domain';
import { McpAppHistoryLine, McpAppSurface } from './mcp-app-surface';
import { bucketIntensity } from '@/lib/attention-text';
import { toolStepShare, type MessageAttentionIndex } from '@/lib/attention-tool-index';
import { transcriptActivitySummary, transcriptRunSummary } from './transcript-activity-summary';
import { ActivityDisclosure, ActivityNest, ActivityRow } from './activity-row';
import { StatusIndicator } from './primitives/status-indicator';
import { IterationReasoningText, TranscriptIterationText } from './transcript-iteration-text';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { HarnessInjection } from './conversation-harness-injection';
import { FlowRunCard } from './flow-run-card';
import { flowToolDescriptor, type FlowToolDescriptor } from './flow-tool-presentation';
import { toolSandboxBoundary } from './sandbox-boundary';
import { TurnSandboxNotices } from './sandbox-boundary-notice';
import { TranscriptDiffCard } from './transcript-diff-card';

type McpAppActivityEntry = Extract<ConversationIteration['activity'][number], { kind: 'mcp_app' }>;

/** The flow a run_flow / run_workflow call started, once its start was accepted. */
function startedFlow(
  tool: ToolInvocation | undefined,
): (FlowToolDescriptor & { handle: string }) | undefined {
  const flow = flowToolDescriptor(tool);
  return flow?.handle ? (flow as FlowToolDescriptor & { handle: string }) : undefined;
}

/** This tool's attention-mode badge, or `undefined` when it carried no traced heat. */
function toolAttentionBadge(
  tool: ToolInvocation,
  index: MessageAttentionIndex | undefined,
): { share: number; bucket: number } | undefined {
  const entries = index?.toolStepsByToolId.get(tool.id);
  const share = toolStepShare(entries);
  return entries && share > 0
    ? { share, bucket: bucketIntensity(share, index?.maxToolStepShare ?? 0) }
    : undefined;
}

interface ConversationTurnProps {
  /** Retained for callers; live following uses the latest visible activity instead. */
  answerStarted?: boolean;
  /** Open the last live group until a newer entry arrives, unless the reader chose otherwise. */
  followLiveActivity?: boolean;
  /**
   * These calls are the agent's latest work and it is still going. They stay as
   * rows until it moves past them, then fold into their counted row.
   */
  turnLive?: boolean;
  iterations: readonly ConversationIteration[];
  mode: 'chain' | 'full';
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  activeMcpAppId?: string;
  mcpAppRepository?: ClioRepository;
  messageSessionId?: string;
  artifacts?: Record<string, Artifact>;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenFile?: (path: string) => void;
  onInteractionResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  messageAttentionIndex?: MessageAttentionIndex;
  /** Present each started flow as a card; off inside a section already split at its flow. */
  flowCards?: boolean;
}

/** Shared Full and Chain projection of the same authoritative iteration objects. */
export function ConversationTurn({
  followLiveActivity = false,
  turnLive = false,
  iterations,
  mode,
  onOpenSubagent,
  subagents,
  interactions,
  activeMcpAppId,
  mcpAppRepository,
  messageSessionId,
  artifacts = {},
  onOpenArtifact,
  onOpenFile,
  onInteractionResponse,
  messageAttentionIndex,
  flowCards = true,
}: ConversationTurnProps) {
  if (iterations.length === 0) return null;
  // Plan decisions are conversation boundaries, not details of hidden activity.
  // Split at the owning tool (including mid-iteration) without changing wire order.
  // A pending question is said on its own tool's row ("waiting for you"), so it
  // stays in place; settled question records keep their tool position and answer.
  const planReviews =
    interactions?.filter(
      (item) =>
        item.source.tool_name === 'plan_exit' ||
        (isToolAnchoredQuestion(item) &&
          item.status === 'pending' &&
          !splitWaitingQuestion([item]).waiting),
    ) ?? [];
  const boundaries = new Map(
    iterations.flatMap((iteration) =>
      iteration.tools.flatMap((tool) => {
        const reviews = questionInteractionsForTool(planReviews, tool.id);
        return reviews.length ? [[tool.id, reviews] as const] : [];
      }),
    ),
  );
  // A started flow is a conversation boundary too: its card stays in the
  // conversation instead of folding into the activity summary.
  const flowStarts = new Map(
    messageSessionId && flowCards
      ? iterations.flatMap((iteration) =>
          iteration.tools.flatMap((tool) => {
            const flow = startedFlow(tool);
            return flow ? [[tool.id, flow] as const] : [];
          }),
        )
      : [],
  );
  const hasActiveApp = iterations.some((iteration) =>
    iteration.activity.some(
      (entry) => entry.kind === 'mcp_app' && entry.block.app_instance_id === activeMcpAppId,
    ),
  );
  if (mode === 'chain' && (boundaries.size > 0 || hasActiveApp || flowStarts.size > 0)) {
    const sections: Array<
      | { kind: 'activity'; iterations: ConversationIteration[] }
      | { kind: 'review'; interaction: PendingInteraction }
      | { kind: 'app'; entry: McpAppActivityEntry }
      | { kind: 'flow'; id: string; flow: FlowToolDescriptor & { handle: string } }
    > = [];
    let group: ConversationIteration[] = [];
    for (const iteration of iterations) {
      let start = 0;
      const appendSegment = (end: number) => {
        const activity = iteration.activity.slice(start, end);
        group.push({
          ...iteration,
          id: `${iteration.id}:segment:${start}`,
          thinking: start === 0 ? iteration.thinking : [],
          nextThoughts: start === 0 ? iteration.nextThoughts : [],
          activity,
          tools: activity.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : [])),
          tasks: activity.flatMap((entry) => (entry.kind === 'task' ? [entry.task] : [])),
        });
      };
      iteration.activity.forEach((entry, index) => {
        if (entry.kind === 'mcp_app' && entry.block.app_instance_id === activeMcpAppId) {
          appendSegment(index);
          sections.push({ kind: 'activity', iterations: group }, { kind: 'app', entry });
          group = [];
          start = index + 1;
          return;
        }
        const reviews = entry.kind === 'tool' ? boundaries.get(entry.id) : undefined;
        const flow = entry.kind === 'tool' ? flowStarts.get(entry.id) : undefined;
        if (!reviews && !flow) return;
        appendSegment(index + 1);
        sections.push({ kind: 'activity', iterations: group });
        group = [];
        if (flow) sections.push({ kind: 'flow', id: entry.id, flow });
        reviews?.forEach((interaction) => sections.push({ kind: 'review', interaction }));
        start = index + 1;
      });
      if (start === 0 || start < iteration.activity.length)
        appendSegment(iteration.activity.length);
    }
    if (group.length) sections.push({ kind: 'activity', iterations: group });
    const activityInteractions = interactions?.filter((item) => !planReviews.includes(item));
    return (
      <div className="flex min-w-0 flex-col gap-4" data-slot="plan-review-sequence">
        {sections.map((section, index) =>
          section.kind === 'review' ? (
            <ConversationInteractionActivity
              key={section.interaction.id}
              artifacts={artifacts}
              interaction={section.interaction}
              onOpenArtifact={onOpenArtifact}
              onResponse={onInteractionResponse}
            />
          ) : section.kind === 'flow' ? (
            <FlowRunCard
              flow={section.flow}
              key={`flow:${section.id}`}
              sessionId={messageSessionId!}
            />
          ) : section.kind === 'app' ? (
            <McpAppActivity
              key={section.entry.id}
              entry={section.entry}
              activeMcpAppId={activeMcpAppId}
              mcpAppRepository={mcpAppRepository}
              messageSessionId={messageSessionId}
            />
          ) : (
            <ConversationTurn
              key={section.iterations[0].id}
              iterations={section.iterations}
              followLiveActivity={followLiveActivity && index === sections.length - 1}
              turnLive={turnLive && index === sections.length - 1}
              mode={mode}
              subagents={subagents}
              interactions={activityInteractions}
              onOpenSubagent={onOpenSubagent}
              activeMcpAppId={activeMcpAppId}
              mcpAppRepository={mcpAppRepository}
              messageSessionId={messageSessionId}
              artifacts={artifacts}
              onOpenArtifact={onOpenArtifact}
              onOpenFile={onOpenFile}
              onInteractionResponse={onInteractionResponse}
              messageAttentionIndex={messageAttentionIndex}
              flowCards={false}
            />
          ),
        )}
      </div>
    );
  }
  if (mode === 'full') {
    return (
      <section aria-label="Full agent activity">
        <div className="space-y-3">
          {iterations.map((iteration) => (
            <IterationDetail
              iteration={iteration}
              flowCards={flowCards}
              key={iteration.id}
              onOpenSubagent={onOpenSubagent}
              showTasks
              subagents={subagents}
              interactions={interactions}
              activeMcpAppId={activeMcpAppId}
              mcpAppRepository={mcpAppRepository}
              messageSessionId={messageSessionId}
              artifacts={artifacts}
              onInteractionResponse={onInteractionResponse}
              onOpenArtifact={onOpenArtifact}
              onOpenFile={onOpenFile}
              messageAttentionIndex={messageAttentionIndex}
            />
          ))}
        </div>
      </section>
    );
  }

  // Public updates are visible boundaries. Reasoning alone continues the same
  // activity block, rather than inserting a separate brain row between groups.
  const groups: ConversationIteration[][] = [];
  for (const iteration of iterations) {
    if (iteration.nextThoughts.length || groups.length === 0) groups.push([iteration]);
    else groups[groups.length - 1].push(iteration);
  }
  return (
    <div
      className="flex min-w-0 flex-col gap-1 [&>[data-row-run]+[data-row-run]]:-mt-1"
      data-slot="transcript-entry-sequence"
    >
      {groups.map((group, index) => {
        const iteration = group[0];
        const summary = transcriptActivitySummary(group);
        const hasActivity = group.some((item) => item.activity.length || item.interrupted);
        return (
          <Fragment key={iteration.id}>
            {/* The step's thought reads first, then its public update, then its calls. */}
            <TranscriptIterationText iteration={iteration} />
            {hasActivity ? (
              <ActivityLane
                id={iteration.id}
                group={[{ ...iteration, thinking: [] }, ...group.slice(1)]}
                label={summary.label}
                live={followLiveActivity && index === groups.length - 1}
                turnLive={(turnLive || followLiveActivity) && index === groups.length - 1}
                subagents={subagents}
                interactions={interactions}
              >
                {(item) => (
                  <Fragment key={item.id}>
                    <IterationReasoningText iteration={item} />
                    <IterationDetail
                      compact
                      flowCards={flowCards}
                      showText={false}
                      iteration={item}
                      onOpenSubagent={onOpenSubagent}
                      subagents={subagents}
                      interactions={interactions}
                      activeMcpAppId={activeMcpAppId}
                      mcpAppRepository={mcpAppRepository}
                      messageSessionId={messageSessionId}
                      artifacts={artifacts}
                      onInteractionResponse={onInteractionResponse}
                      onOpenArtifact={onOpenArtifact}
                      onOpenFile={onOpenFile}
                      messageAttentionIndex={messageAttentionIndex}
                    />
                  </Fragment>
                )}
              </ActivityLane>
            ) : (
              group
                .slice(1)
                .map((item) => <IterationReasoningText key={item.id} iteration={item} />)
            )}
            {/* A call the sandbox blocked is said where the person reads, with its Allow
                control, not only inside the folded activity. */}
            <TurnSandboxNotices
              boundaries={group.flatMap((item) =>
                item.tools.flatMap((tool) => {
                  const boundary = toolSandboxBoundary(tool);
                  return boundary ? [boundary] : [];
                }),
              )}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

/** Rows a step shows before the earlier ones fold behind "Show all N". */
const LANE_LIMIT = 6;
const LANE_TAIL = 4;

function laneRows(item: ConversationIteration): number {
  return item.thinking.length + item.activity.length;
}

/** The last `keep` rows of a group, cutting iterations at their row boundaries. */
function laneTail(group: readonly ConversationIteration[], keep: number): ConversationIteration[] {
  let drop = group.reduce((total, item) => total + laneRows(item), 0) - keep;
  return group.flatMap((item) => {
    if (drop <= 0) return [item];
    const thinking = Math.min(drop, item.thinking.length);
    drop -= thinking;
    const entries = Math.min(drop, item.activity.length);
    drop -= entries;
    if (thinking === item.thinking.length && entries === item.activity.length && laneRows(item))
      return [];
    const activity = item.activity.slice(entries);
    return [
      {
        ...item,
        thinking: item.thinking.slice(thinking),
        activity,
        tools: activity.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : [])),
        tasks: activity.flatMap((entry) => (entry.kind === 'task' ? [entry.task] : [])),
      },
    ];
  });
}

/**
 * A step's activity as flat rows in the conversation: thoughts, calls,
 * delegates and tasks, one 28px row each, in the order they happened. A long
 * step shows its latest rows; "Show all N" opens the rest and stays open.
 * Once the run has finished, it folds into one row that counts what it did,
 * "Called 3 tools, edited 2 files, delegated 1 task", and opens to the rows.
 */
function ActivityLane({
  id,
  group,
  label,
  live,
  turnLive,
  subagents,
  interactions,
  children,
}: {
  id: string;
  group: readonly ConversationIteration[];
  label: string;
  live: boolean;
  turnLive: boolean;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  children: (item: ConversationIteration) => ReactNode;
}) {
  const [all, setAll] = useTranscriptDisclosure(`activity:${id}`, false);
  const [runOpen, setRunOpen] = useTranscriptDisclosure(`run:${id}`, false);
  const total = group.reduce((sum, item) => sum + laneRows(item), 0);
  const folded = !all && total > LANE_LIMIT;
  const shown = folded ? laneTail(group, LANE_TAIL) : group;
  // Steps after the last call that only think are the agent moving on; they
  // stay below the run rather than inside it.
  let headEnd = group.length;
  while (headEnd > 0 && !group[headEnd - 1].activity.length && !group[headEnd - 1].interrupted)
    headEnd -= 1;
  const head = group.slice(0, headEnd);
  const afterIds = new Set(group.slice(headEnd).map((item) => item.id));
  // A settled run folds once the agent has moved past it; one call folds into
  // nothing shorter, and thoughts alone stay as they are.
  const collapses =
    (!turnLive || afterIds.size > 0) &&
    head.reduce(
      (sum, item) => sum + item.activity.filter((entry) => entry.kind !== 'diff').length,
      0,
    ) > 1 &&
    runSettled(head, interactions);
  const showAll = folded ? (
    <Button
      variant="ghost"
      onClick={() => setAll(true)}
      className="mt-1 ml-[22px] h-6 rounded-[4px] px-2 text-[11.5px] font-normal text-muted-foreground hover:bg-hover hover:text-foreground"
      data-slot="activity-show-all"
    >
      {`Show all ${total}`}
    </Button>
  ) : null;
  const run = collapses
    ? transcriptRunSummary(head, (tool) =>
        subagentsForTool(tool, subagents).map((subagent) => subagent.id),
      )
    : undefined;
  return (
    <div
      role="group"
      aria-label={`Activity: ${run?.label ?? label}`}
      aria-busy={live || undefined}
      // Top-level rows sit 4px apart (a 32px pitch); rows one step in stay at 28px.
      // The lane's -mt-1 takes back the first row's margin so text to row stays 8px.
      className="-mt-1 min-w-0 [&_[data-slot=activity-row]:not([data-slot=activity-nest]_*):not([data-slot=activity-body]_*)]:mt-1"
      data-row-run=""
      data-run-collapsed={run && !runOpen ? '' : undefined}
      data-slot="transcript-activity-timeline"
      // A reader who opens something in a run while it works keeps it open
      // when the run folds at the end of the turn.
      onClickCapture={run || runOpen ? undefined : () => setRunOpen(true)}
      onKeyDownCapture={
        run || runOpen
          ? undefined
          : (event) => {
              if (event.key === 'Enter' || event.key === ' ') setRunOpen(true);
            }
      }
    >
      {run ? (
        <ActivityRow
          aria-expanded={runOpen}
          data-run-summary=""
          disclosure={
            <ActivityDisclosure
              label={`${runOpen ? 'Collapse' : 'Expand'} ${run.label}`}
              open={runOpen}
              onClick={() => setRunOpen(!runOpen)}
            />
          }
          icon={<WrenchIcon aria-hidden="true" />}
          name={run.label}
          onOpenChange={setRunOpen}
          open={runOpen}
          outcome={
            [
              run.failed ? `${run.failed} failed` : '',
              run.interrupted ? `${run.interrupted} stopped` : '',
            ]
              .filter(Boolean)
              .join(', ') || undefined
          }
          outcomeTone={run.failed ? 'error' : 'muted'}
          status={
            <StatusIndicator
              display="column"
              label={run.failed ? 'Some calls failed' : run.interrupted ? 'Stopped' : 'Done'}
              mark="glyph"
              tone={run.failed ? 'error' : run.interrupted ? 'stopped' : 'success'}
            />
          }
        />
      ) : null}
      {/* One parent in both shapes keeps each row's own state when the run folds. */}
      {run && !runOpen ? null : (
        <ActivityNest flat={!run} label={`Calls: ${run?.label ?? label}`}>
          {showAll}
          {shown.filter((item) => !afterIds.has(item.id)).map(children)}
        </ActivityNest>
      )}
      {shown.filter((item) => afterIds.has(item.id)).map(children)}
    </div>
  );
}

/** Nothing in the run is still working or waiting, so it can fold. */
function runSettled(
  group: readonly ConversationIteration[],
  interactions: readonly PendingInteraction[] | undefined,
): boolean {
  return group.every(
    (item) =>
      !item.streaming &&
      item.thinking.every((thought) => !thought.streaming) &&
      item.tools.every(
        (tool) =>
          !['pending', 'running'].includes(tool.state) &&
          !permissionInteractionForTool(interactions, tool),
      ) &&
      item.tasks.every((task) => !['queued', 'running'].includes(task.state)),
  );
}

function IterationDetail({
  iteration,
  onOpenSubagent,
  subagents,
  interactions,
  showTasks = true,
  showSubagents = true,
  showQuestionInteractions = true,
  showText = true,
  compact = false,
  flowCards = true,
  activeMcpAppId,
  hiddenMcpAppIds,
  mcpAppRepository,
  messageSessionId,
  artifacts,
  onOpenArtifact,
  onOpenFile,
  onInteractionResponse,
  messageAttentionIndex,
}: {
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  showTasks?: boolean;
  showSubagents?: boolean;
  showQuestionInteractions?: boolean;
  showText?: boolean;
  compact?: boolean;
  flowCards?: boolean;
  activeMcpAppId?: string;
  hiddenMcpAppIds?: readonly string[];
  mcpAppRepository?: ClioRepository;
  messageSessionId?: string;
  artifacts: Record<string, Artifact>;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenFile?: (path: string) => void;
  messageAttentionIndex?: MessageAttentionIndex;
  onInteractionResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const explicitSubagentIds = new Set(
    iteration.activity.flatMap((entry) =>
      entry.kind === 'subagent' ? [entry.block.subagent_id] : [],
    ),
  );
  // An assignment tool already reads as the delegate row; its child's start line would repeat it.
  const delegatedSubagentIds = new Set(
    iteration.activity.flatMap((entry) =>
      entry.kind === 'tool' && TOOL_OPERATIONS[entry.tool.name]?.family === 'assignment'
        ? subagentsForTool(entry.tool, subagents).map((subagent) => subagent.id)
        : [],
    ),
  );
  return (
    <article>
      <div className={compact ? 'min-w-0' : 'space-y-2'}>
        {showText ? <TranscriptIterationText iteration={iteration} /> : null}

        {/*
          One ordered lane: a Task carries no owning-tool field, so its position
          beside a tool is the only record of what it belongs to. Rendering all
          tools and then all tasks would destroy that correlation.
        */}
        {iteration.activity.map((entry) =>
          entry.kind === 'tool' ? (
            (() => {
              const { waiting: question, rest } = showQuestionInteractions
                ? splitWaitingQuestion(questionInteractionsForTool(interactions, entry.id))
                : { waiting: undefined, rest: [] };
              const waiting = question ?? permissionInteractionForTool(interactions, entry.tool);
              return (
                <Fragment key={`tool:${entry.id}`}>
                  <div
                    className={compact ? undefined : 'space-y-1'}
                    data-turn-activity={`tool:${entry.id}`}
                  >
                    <ClioToolInvocation
                      compact={compact}
                      flowResult={flowCards}
                      attention={toolAttentionBadge(entry.tool, messageAttentionIndex)}
                      attentionFields={messageAttentionIndex?.toolStepsByToolId.get(entry.tool.id)}
                      sessionId={messageSessionId}
                      tool={entry.tool}
                      waitingFor={waiting}
                    />
                    {(TOOL_OPERATIONS[entry.tool.name]?.family === 'assignment'
                      ? []
                      : subagentsForTool(entry.tool, subagents)
                    )
                      .filter((subagent) => !explicitSubagentIds.has(subagent.id))
                      .map((subagent) => (
                        <ClioSubagentLifecycleLine
                          key={subagent.id}
                          onOpen={onOpenSubagent}
                          subagent={subagent}
                          stage="delegate.started"
                        />
                      ))}
                  </div>
                  {rest.map((interaction) => (
                    <ConversationInteractionActivity
                      artifacts={artifacts}
                      interaction={interaction}
                      key={interaction.id}
                      onOpenArtifact={onOpenArtifact}
                      onResponse={onInteractionResponse}
                    />
                  ))}
                </Fragment>
              );
            })()
          ) : entry.kind === 'injection' ? (
            <div
              data-call-id={entry.block.call_id}
              data-turn-activity={`injection:${entry.id}`}
              key={`injection:${entry.id}`}
            >
              <HarnessInjection block={entry.block} compact={compact} />
            </div>
          ) : entry.kind === 'subagent' ? (
            showSubagents &&
            !(
              entry.block.stage === 'delegate.started' &&
              delegatedSubagentIds.has(entry.block.subagent_id)
            ) ? (
              <div data-turn-activity={`subagent:${entry.id}`} key={`subagent:${entry.id}`}>
                <ClioSubagentLifecycleLine
                  onOpen={onOpenSubagent}
                  stage={entry.block.stage ?? 'delegate.unknown'}
                  subagent={subagents[entry.block.subagent_id]}
                  task={entry.block.task}
                />
              </div>
            ) : null
          ) : entry.kind === 'agent_message' ? (
            <div data-turn-activity={`agent-message:${entry.id}`} key={`agent-message:${entry.id}`}>
              <ClioAgentMessageLine
                block={entry.block}
                onOpen={onOpenSubagent}
                subagent={subagents[entry.block.subagent_id]}
              />
            </div>
          ) : entry.kind === 'mcp_app' ? (
            hiddenMcpAppIds?.includes(entry.block.app_instance_id) ? null : (
              <McpAppActivity
                activeMcpAppId={activeMcpAppId}
                entry={entry}
                key={`mcp-app:${entry.id}`}
                mcpAppRepository={mcpAppRepository}
                messageSessionId={messageSessionId}
              />
            )
          ) : entry.kind === 'diff' ? (
            <div data-turn-activity={`diff:${entry.id}`} key={`diff:${entry.id}`}>
              <TranscriptDiffCard block={entry.block} onOpenFile={onOpenFile} />
            </div>
          ) : showTasks ? (
            <TranscriptTaskRow key={`task:${entry.id}`} id={entry.id} task={entry.task} />
          ) : null,
        )}
        {iteration.interrupted && !iteration.tools.some(isToolStopped) ? (
          <ClioStatus value="interrupted" />
        ) : null}
      </div>
    </article>
  );
}

function McpAppActivity({
  activeMcpAppId,
  entry,
  mcpAppRepository,
  messageSessionId,
}: {
  activeMcpAppId?: string;
  entry: McpAppActivityEntry;
  mcpAppRepository?: ClioRepository;
  messageSessionId?: string;
}) {
  return (
    <div data-turn-activity={`mcp-app:${entry.id}`}>
      {entry.block.app_instance_id === activeMcpAppId && mcpAppRepository && messageSessionId ? (
        <McpAppSurface
          appInstanceId={entry.block.app_instance_id}
          dataRef={entry.block.data_ref}
          height={entry.block.height}
          repository={mcpAppRepository}
          resourceUri={entry.block.resource_uri}
          sessionId={messageSessionId}
          sourceServer={entry.block.source_server}
          toolName={entry.block.tool_name}
        />
      ) : (
        <McpAppHistoryLine
          sourceServer={entry.block.source_server}
          toolName={entry.block.tool_name}
        />
      )}
    </div>
  );
}
