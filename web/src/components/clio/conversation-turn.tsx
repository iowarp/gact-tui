import { isToolAnchoredQuestion } from '@/lib/inline-question';
import { Fragment } from 'react';
import type {
  Artifact,
  ClioRepository,
  PendingInteraction,
  PendingInteractionResponse,
  SubagentRun,
  ToolInvocation,
} from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import type { SubagentOpenTarget } from './subagent-card';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import {
  isCausalQuestionInteraction,
  permissionInteractionForTool,
  questionInteractionsForTool,
  splitWaitingQuestion,
} from './agent-answer-domain';
import type { MessageAttentionIndex } from '@/lib/attention-tool-index';
import { transcriptActivitySummary } from './transcript-activity-summary';
import { IterationReasoningText, TranscriptIterationText } from './transcript-iteration-text';
import { FlowRunCard } from './flow-run-card';
import { flowToolDescriptor, type FlowToolDescriptor } from './flow-tool-presentation';
import { toolSandboxBoundary } from './sandbox-boundary';
import { TurnSandboxNotices } from './sandbox-boundary-notice';
import { useShownMcpAppIds } from './mcp-app-live-set';
import { ActivityLane } from './conversation-activity-lane';
import {
  IterationDetail,
  McpAppActivity,
  type McpAppActivityEntry,
} from './conversation-iteration-detail';

/** The flow a run_flow / run_workflow call started, once its start was accepted. */
function startedFlow(
  tool: ToolInvocation | undefined,
): (FlowToolDescriptor & { handle: string }) | undefined {
  const flow = flowToolDescriptor(tool);
  return flow?.handle ? (flow as FlowToolDescriptor & { handle: string }) : undefined;
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
  /**
   * The live message's latest calls: a call held for approval before the service
   * projects it is shown here, even when a context injection follows these calls.
   */
  holdsWaitingCalls?: boolean;
  iterations: readonly ConversationIteration[];
  mode: 'chain' | 'full';
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
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

/**
 * An answer delivered back to the agent ("Your answer") that its ask's own
 * "Answered" row already shows is not said a second time.
 */
function withoutRestatedAnswers(
  iterations: readonly ConversationIteration[],
  interactions: readonly PendingInteraction[] | undefined,
): readonly ConversationIteration[] {
  const answered = new Set(
    (interactions ?? []).flatMap((row) =>
      row.status === 'answered' && row.task_id && isCausalQuestionInteraction(row)
        ? [row.task_id]
        : [],
    ),
  );
  if (!answered.size) return iterations;
  const restated = (entry: ConversationIteration['activity'][number]) => {
    if (entry.kind !== 'injection' || entry.block.source !== 'question_answer') return false;
    const handle = /; Question ([^\s:]+):/u.exec(entry.block.text)?.[1];
    return Boolean(handle && answered.has(handle));
  };
  if (!iterations.some((iteration) => iteration.activity.some(restated))) return iterations;
  return iterations.flatMap((iteration) => {
    if (!iteration.activity.some(restated)) return [iteration];
    const activity = iteration.activity.filter((entry) => !restated(entry));
    return activity.length || iteration.thinking.length || iteration.nextThoughts.length
      ? [{ ...iteration, activity }]
      : [];
  });
}

/**
 * A call held for approval before the service projects it (a write outside the
 * workspace asks for folder access first) still reads as the run's own row,
 * "Write file · a.txt · waiting for you", rather than the run looking done.
 */
function withWaitingCalls(
  iterations: readonly ConversationIteration[],
  interactions: readonly PendingInteraction[] | undefined,
  sessionId: string | undefined,
): readonly ConversationIteration[] {
  const last = iterations.at(-1);
  if (!last || !sessionId || !interactions?.length) return iterations;
  const tools = iterations.flatMap((iteration) => iteration.tools);
  const standIns = interactions.flatMap((interaction): ToolInvocation[] => {
    const call = interaction.payload?.tool_call;
    const name = interaction.source.tool_name ?? call?.tool_name;
    if (
      interaction.kind !== 'permission' ||
      interaction.status !== 'pending' ||
      interaction.owner_session_id !== sessionId ||
      !name
    )
      return [];
    const invocation = interaction.source.invocation_id;
    if (invocation && tools.some((tool) => tool.id === invocation)) return [];
    const standIn: ToolInvocation = {
      id: invocation || `waiting:${interaction.id}`,
      session_id: sessionId,
      name,
      state: 'pending',
      input: call?.input,
    };
    return tools.some((tool) => permissionInteractionForTool([interaction], tool) === interaction)
      ? []
      : [standIn];
  });
  if (!standIns.length) return iterations;
  return [
    ...iterations.slice(0, -1),
    {
      ...last,
      activity: [
        ...last.activity,
        ...standIns.map((tool) => ({ kind: 'tool' as const, id: tool.id, tool })),
      ],
      tools: [...last.tools, ...standIns],
    },
  ];
}

/** Shared Full and Chain projection of the same authoritative iteration objects. */
export function ConversationTurn({
  followLiveActivity = false,
  turnLive = false,
  holdsWaitingCalls = turnLive,
  iterations: recordedIterations,
  mode,
  onOpenSubagent,
  subagents,
  interactions,
  mcpAppRepository,
  messageSessionId,
  artifacts = NO_ARTIFACTS,
  onOpenArtifact,
  onOpenFile,
  onInteractionResponse,
  messageAttentionIndex,
  flowCards = true,
}: ConversationTurnProps) {
  // Apps whose card shows something live stand apart from the folded activity.
  const shownMcpApps = useShownMcpAppIds();
  const iterations = withWaitingCalls(
    withoutRestatedAnswers(recordedIterations, interactions),
    holdsWaitingCalls ? interactions : undefined,
    messageSessionId,
  );
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
      (entry) => entry.kind === 'mcp_app' && shownMcpApps.has(entry.block.app_instance_id),
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
        if (entry.kind === 'mcp_app' && shownMcpApps.has(entry.block.app_instance_id)) {
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
              mcpAppRepository={mcpAppRepository}
              messageSessionId={messageSessionId}
            />
          ) : (
            <ConversationTurn
              key={section.iterations[0].id}
              iterations={section.iterations}
              followLiveActivity={followLiveActivity && index === sections.length - 1}
              turnLive={turnLive && index === sections.length - 1}
              holdsWaitingCalls={false}
              mode={mode}
              subagents={subagents}
              interactions={activityInteractions}
              onOpenSubagent={onOpenSubagent}
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
  // Everything between two public updates is one block of activity, in the order
  // it happened. The thought that leads into an update ends the block before it,
  // so a harness update ahead of the reply folds with that thought. Only an
  // opening update with nothing before it keeps its thought above it.
  const blocks = groups.map((group) => {
    const [lead, ...rest] = group;
    const said = lead.nextThoughts.length > 0;
    return {
      text: { ...lead, thinking: [] as ConversationIteration['thinking'] },
      steps: [{ ...lead, thinking: said ? [] : lead.thinking }, ...rest],
    };
  });
  groups.forEach(([lead], index) => {
    if (!lead.thinking.length || !lead.nextThoughts.length) return;
    if (index === 0) blocks[0].text = lead;
    else
      blocks[index - 1].steps.push({
        ...lead,
        id: `${lead.id}:thinking`,
        nextThoughts: [],
        nextThoughtSources: undefined,
        activity: [],
        tools: [],
        tasks: [],
        interrupted: false,
        terminal: false,
        streaming: lead.thinking.some((thought) => thought.streaming),
      });
  });
  return (
    <div
      // A row run that opens the reply starts 6px down, where reply text starts
      // (the lane's own first row adds 4px of its 6).
      className="flex min-w-0 flex-col gap-1 [&>[data-row-run]+[data-row-run]]:-mt-1 [&>[data-slot=transcript-activity-timeline]:first-child]:mt-0.5 [&>[data-slot=transcript-thought-run]:first-child]:mt-1.5"
      data-slot="transcript-entry-sequence"
    >
      {blocks.map(({ text: iteration, steps: group }, index) => {
        const summary = transcriptActivitySummary(group, interactions);
        const hasActivity = group.some((item) => item.activity.length || item.interrupted);
        return (
          <Fragment key={iteration.id}>
            <TranscriptIterationText iteration={iteration} />
            {hasActivity ? (
              <ActivityLane
                id={iteration.id}
                group={group}
                label={summary.label}
                live={followLiveActivity && index === groups.length - 1}
                turnLive={(turnLive || followLiveActivity) && index === groups.length - 1}
                subagents={subagents}
                interactions={interactions}
                rowInputs={[
                  flowCards,
                  onOpenSubagent,
                  shownMcpApps,
                  mcpAppRepository,
                  messageSessionId,
                  artifacts,
                  onInteractionResponse,
                  onOpenArtifact,
                  onOpenFile,
                  messageAttentionIndex,
                ]}
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
              group.map((item) => <IterationReasoningText key={item.id} iteration={item} />)
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

const NO_ARTIFACTS: Record<string, Artifact> = {};
