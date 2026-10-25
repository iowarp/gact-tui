import { isToolAnchoredQuestion } from '@/lib/inline-question';
import { CircleAlertIcon, ListChecksIcon, LoaderCircleIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { cn } from '@/lib/utils';
import type {
  Artifact,
  ClioRepository,
  PendingInteraction,
  PendingInteractionResponse,
  SubagentRun,
  Task,
  ToolInvocation,
} from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { ClioStatus } from './status';
import { getToolStatus } from './tool-presentation';
import {
  ClioAgentMessageLine,
  ClioSubagentLifecycleLine,
  type SubagentOpenTarget,
} from './subagent-card';
import { subagentsForTool } from './subagent-tool-link';
import { ClioToolInvocation } from './tool-invocation';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import { questionInteractionsForTool } from './agent-answer-domain';
import { McpAppHistoryLine, McpAppSurface } from './mcp-app-surface';
import { bucketIntensity } from '@/lib/attention-text';
import { toolStepShare, type MessageAttentionIndex } from '@/lib/attention-tool-index';
import { transcriptActivitySummary } from './transcript-activity-summary';
import { IterationReasoningText, TranscriptIterationText } from './transcript-iteration-text';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { HarnessInjection } from './conversation-harness-injection';
import { FlowRunCard } from './flow-run-card';
import { flowToolDescriptor, type FlowToolDescriptor } from './flow-tool-presentation';

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
  onInteractionResponse,
  messageAttentionIndex,
  flowCards = true,
}: ConversationTurnProps) {
  if (iterations.length === 0) return null;
  // Plan decisions are conversation boundaries, not details of hidden activity.
  // Split at the owning tool (including mid-iteration) without changing wire order.
  // Pending questions stay answerable in the log. Settled question records
  // return to Activity, preserving their original tool position and answer.
  const planReviews =
    interactions?.filter(
      (item) =>
        item.source.tool_name === 'plan_exit' ||
        (isToolAnchoredQuestion(item) && item.status === 'pending'),
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
              mode={mode}
              subagents={subagents}
              interactions={activityInteractions}
              onOpenSubagent={onOpenSubagent}
              activeMcpAppId={activeMcpAppId}
              mcpAppRepository={mcpAppRepository}
              messageSessionId={messageSessionId}
              artifacts={artifacts}
              onOpenArtifact={onOpenArtifact}
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
    <div className="flex min-w-0 flex-col gap-2" data-slot="transcript-entry-sequence">
      {groups.map((group, index) => {
        const iteration = group[0];
        const summary = transcriptActivitySummary(group);
        const hasActivity = group.some((item) => item.activity.length || item.interrupted);
        return (
          <Fragment key={iteration.id}>
            <TranscriptIterationText iteration={iteration} showReasoning={!hasActivity} />
            {hasActivity ? (
              <ActivityChain
                id={iteration.id}
                defaultOpen={followLiveActivity && index === groups.length - 1}
              >
                <ChainOfThoughtHeader
                  aria-label={`Activity: ${summary.label}`}
                  className="min-h-7 [&>svg:first-child]:hidden"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {summary.running ? (
                      <LoaderCircleIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 animate-spin text-primary"
                      />
                    ) : null}
                    <span className="min-w-0 truncate font-medium">{summary.label}</span>
                    {summary.failed ? (
                      <span
                        className="shrink-0"
                        data-slot="activity-failed-mark"
                        title={summary.failed === 1 ? 'A call failed' : 'Calls failed'}
                      >
                        <CircleAlertIcon aria-hidden="true" className="size-3.5 text-destructive" />
                      </span>
                    ) : null}
                  </span>
                </ChainOfThoughtHeader>
                <ChainOfThoughtContent
                  className="ml-1 mt-1 space-y-1 border-l pl-3"
                  data-slot="transcript-activity-timeline"
                >
                  {group.map((item) => (
                    <Fragment key={item.id}>
                      <IterationReasoningText iteration={item} />
                      <IterationDetail
                        compact
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
                        messageAttentionIndex={messageAttentionIndex}
                      />
                    </Fragment>
                  ))}
                </ChainOfThoughtContent>
              </ActivityChain>
            ) : (
              group
                .slice(1)
                .map((item) => <IterationReasoningText key={item.id} iteration={item} />)
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Follow the latest live work while retaining explicit reader choices.
 */
function ActivityChain({
  children,
  id,
  defaultOpen,
}: {
  children: ReactNode;
  id: string;
  defaultOpen: boolean;
}) {
  const [readerOpen, setReaderOpen] = useTranscriptDisclosure(`activity:${id}`, defaultOpen);
  // Only activity boundaries add room; adjacent prose retains its normal gap.
  return (
    <ChainOfThought
      className="@container my-3 space-y-0"
      onOpenChange={setReaderOpen}
      open={readerOpen}
    >
      {children}
    </ChainOfThought>
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
  activeMcpAppId,
  hiddenMcpAppIds,
  mcpAppRepository,
  messageSessionId,
  artifacts,
  onOpenArtifact,
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
  activeMcpAppId?: string;
  hiddenMcpAppIds?: readonly string[];
  mcpAppRepository?: ClioRepository;
  messageSessionId?: string;
  artifacts: Record<string, Artifact>;
  onOpenArtifact?: (artifact: Artifact) => void;
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
  return (
    <article>
      <div className="space-y-2">
        {showText ? <TranscriptIterationText iteration={iteration} /> : null}

        {/*
          One ordered lane: a Task carries no owning-tool field, so its position
          beside a tool is the only record of what it belongs to. Rendering all
          tools and then all tasks would destroy that correlation.
        */}
        {iteration.activity.map((entry) =>
          entry.kind === 'tool' ? (
            <Fragment key={`tool:${entry.id}`}>
              <div className="space-y-1" data-turn-activity={`tool:${entry.id}`}>
                <ClioToolInvocation
                  compact={compact}
                  attention={toolAttentionBadge(entry.tool, messageAttentionIndex)}
                  attentionFields={messageAttentionIndex?.toolStepsByToolId.get(entry.tool.id)}
                  sessionId={messageSessionId}
                  tool={entry.tool}
                />
                {!compact && messageSessionId && startedFlow(entry.tool) ? (
                  <FlowRunCard flow={startedFlow(entry.tool)!} sessionId={messageSessionId} />
                ) : null}
                {subagentsForTool(entry.tool, subagents)
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
              {showQuestionInteractions
                ? questionInteractionsForTool(interactions, entry.id).map((interaction) => (
                    <ConversationInteractionActivity
                      artifacts={artifacts}
                      interaction={interaction}
                      key={interaction.id}
                      onOpenArtifact={onOpenArtifact}
                      onResponse={onInteractionResponse}
                    />
                  ))
                : null}
            </Fragment>
          ) : entry.kind === 'injection' ? (
            <div
              data-call-id={entry.block.call_id}
              data-turn-activity={`injection:${entry.id}`}
              key={`injection:${entry.id}`}
            >
              <HarnessInjection block={entry.block} compact={compact} />
            </div>
          ) : entry.kind === 'subagent' ? (
            showSubagents ? (
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
          ) : showTasks ? (
            <TaskActivityLine key={`task:${entry.id}`} task={entry.task} />
          ) : null,
        )}
        {iteration.interrupted &&
        !iteration.tools.some((tool) => getToolStatus(tool) === 'interrupted') ? (
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
/**
 * A task line is a plain span, and ARIA prohibits naming a generic element, so
 * its state and detail are rendered as real content (visible or screen-reader
 * only) rather than hidden behind an `aria-label` assistive technology is free
 * to ignore.
 */
function TaskActivityLine({ task, className }: { task: Task; className?: string }) {
  return (
    <span
      className={cn('flex min-w-0 items-center gap-2 text-xs text-muted-foreground', className)}
      data-turn-activity={`task:${task.id}`}
      title={task.detail}
    >
      <ListChecksIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-foreground/85">{task.title}</span>
      <ClioStatus
        className="h-auto shrink-0 border-0 bg-transparent px-0 py-0 shadow-none"
        value={task.state}
      />
      <span className="min-w-0 max-w-[45%] truncate" title={task.detail || 'No detail reported'}>
        {task.detail || 'No detail reported'}
      </span>
    </span>
  );
}
