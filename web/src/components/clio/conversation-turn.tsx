import { isToolAnchoredQuestion } from '@/lib/inline-question';
import { ListChecksIcon, LoaderCircleIcon, WorkflowIcon } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
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
import {
  ClioSubagentCard,
  ClioAgentMessageLine,
  ClioSubagentLifecycleLine,
  type SubagentOpenTarget,
} from './subagent-card';
import { subagentsForTool } from './subagent-tool-link';
import { ClioToolInvocation } from './tool-invocation';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import { questionInteractionsForTool } from './agent-answer-domain';
import { McpAppHistoryLine, McpAppSurface } from './mcp-app-surface';
import { workflowDescriptor } from './workflow-tool-presentation';
import { bucketIntensity } from '@/lib/attention-text';
import { toolStepShare, type MessageAttentionIndex } from '@/lib/attention-tool-index';
import { transcriptActivitySummary } from './transcript-activity-summary';
import { TranscriptIterationText } from './transcript-iteration-text';

type McpAppActivityEntry = Extract<ConversationIteration['activity'][number], { kind: 'mcp_app' }>;
type SubagentActivityEntry = Extract<
  ConversationIteration['activity'][number],
  { kind: 'subagent' }
>;

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
  /** Retained for callers; entry disclosures are now entirely reader-controlled. */
  answerStarted?: boolean;
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
}

/** Shared Full and Chain projection of the same authoritative iteration objects. */
export function ConversationTurn({
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
  const hasActiveApp = iterations.some((iteration) =>
    iteration.activity.some(
      (entry) => entry.kind === 'mcp_app' && entry.block.app_instance_id === activeMcpAppId,
    ),
  );
  if (mode === 'chain' && (boundaries.size > 0 || hasActiveApp)) {
    const sections: Array<
      | { kind: 'activity'; iterations: ConversationIteration[] }
      | { kind: 'review'; interaction: PendingInteraction }
      | { kind: 'app'; entry: McpAppActivityEntry }
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
        if (!reviews) return;
        appendSegment(index + 1);
        sections.push({ kind: 'activity', iterations: group });
        group = [];
        reviews.forEach((interaction) => sections.push({ kind: 'review', interaction }));
        start = index + 1;
      });
      if (start === 0 || start < iteration.activity.length)
        appendSegment(iteration.activity.length);
    }
    if (group.length) sections.push({ kind: 'activity', iterations: group });
    const activityInteractions = interactions?.filter((item) => !planReviews.includes(item));
    return (
      <div className="flex min-w-0 flex-col gap-4" data-slot="plan-review-sequence">
        {sections.map((section) =>
          section.kind === 'review' ? (
            <ConversationInteractionActivity
              key={section.interaction.id}
              artifacts={artifacts}
              interaction={section.interaction}
              onOpenArtifact={onOpenArtifact}
              onResponse={onInteractionResponse}
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

  return (
    <div className="space-y-4" data-slot="transcript-entry-sequence">
      {iterations.map((iteration) => {
        const summary = transcriptActivitySummary([iteration]);
        return (
          <Fragment key={iteration.id}>
            <TranscriptIterationText iteration={iteration} />
            {iteration.activity.length || iteration.interrupted ? (
              <ActivityChain>
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
                  </span>
                </ChainOfThoughtHeader>
                <ChainOfThoughtContent
                  className="ml-1 mt-1 space-y-1 border-l pl-3"
                  data-slot="transcript-activity-timeline"
                >
                  <IterationDetail
                    compact
                    showText={false}
                    iteration={iteration}
                    key={iteration.id}
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
                </ChainOfThoughtContent>
              </ActivityChain>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * A recorded iteration's tool group. Only the reader opens it, including while
 * tools stream; a later answer never changes that choice.
 */
function ActivityChain({ children }: { children: ReactNode }) {
  const [readerOpen, setReaderOpen] = useState(false);
  return (
    <ChainOfThought className="@container space-y-0" onOpenChange={setReaderOpen} open={readerOpen}>
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
  const workflowTaskIds = new Set(
    iteration.activity.flatMap((entry) =>
      entry.kind === 'tool'
        ? (workflowDescriptor(entry.tool)?.steps.flatMap((step) => step.taskId ?? []) ?? [])
        : [],
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
                  inlineDetails={compact}
                  attention={toolAttentionBadge(entry.tool, messageAttentionIndex)}
                  attentionFields={messageAttentionIndex?.toolStepsByToolId.get(entry.tool.id)}
                  sessionId={messageSessionId}
                  tool={entry.tool}
                />
                {workflowDescriptor(entry.tool) ? (
                  <WorkflowChildGroup
                    descriptor={workflowDescriptor(entry.tool)!}
                    events={iteration.activity.filter(
                      (candidate): candidate is SubagentActivityEntry =>
                        candidate.kind === 'subagent' &&
                        (workflowDescriptor(entry.tool)?.steps.some(
                          (step) => step.taskId === candidate.block.subagent_id,
                        ) ??
                          false),
                    )}
                    onOpenSubagent={onOpenSubagent}
                    subagents={subagents}
                  />
                ) : null}
                {subagentsForTool(entry.tool, subagents)
                  .filter((subagent) => !explicitSubagentIds.has(subagent.id))
                  .map((subagent) => (
                    <ClioSubagentCard
                      key={subagent.id}
                      onOpen={onOpenSubagent}
                      subagent={subagent}
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
          ) : entry.kind === 'subagent' ? (
            workflowTaskIds.has(entry.block.subagent_id) ? null : showSubagents ? (
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
        {iteration.interrupted ? <ClioStatus value="interrupted" /> : null}
      </div>
    </article>
  );
}

function WorkflowChildGroup({
  descriptor,
  events,
  onOpenSubagent,
  subagents,
}: {
  descriptor: NonNullable<ReturnType<typeof workflowDescriptor>>;
  events: SubagentActivityEntry[];
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
}) {
  if (events.length === 0) return null;
  return (
    <div
      aria-label={`Workflow steps: ${descriptor.label}`}
      className="ml-2 min-w-0 border-l pl-3"
      role="group"
    >
      <p className="mb-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <WorkflowIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-foreground/85">Workflow steps</span>
        <span className="truncate">{descriptor.label}</span>
      </p>
      <div className="space-y-0.5">
        {events.map((entry) => (
          <ClioSubagentLifecycleLine
            key={`workflow-subagent:${entry.id}`}
            onOpen={onOpenSubagent}
            stage={entry.block.stage ?? 'delegate.unknown'}
            subagent={subagents[entry.block.subagent_id]}
            task={entry.block.task}
          />
        ))}
      </div>
    </div>
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
