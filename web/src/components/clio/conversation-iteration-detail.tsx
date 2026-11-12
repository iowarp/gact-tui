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
import { TranscriptIterationText } from './transcript-iteration-text';
import { HarnessInjection } from './conversation-harness-injection';
import { TranscriptDiffCard } from './transcript-diff-card';
import { toolOutputDiffKey } from './declared-diff-key';

export type McpAppActivityEntry = Extract<
  ConversationIteration['activity'][number],
  { kind: 'mcp_app' }
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

export function IterationDetail({
  iteration,
  onOpenSubagent,
  subagents,
  interactions,
  showTasks = true,
  showSubagents = true,
  showQuestionInteractions = true,
  showText = true,
  compact = false,
  openFileChanges = true,
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
  /** Whether a file change mounts with its diff open; false while the turn works. */
  openFileChanges?: boolean;
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
                ? splitWaitingQuestion(
                    questionInteractionsForTool(interactions, entry.id),
                    entry.tool.name,
                  )
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
                      // A file change reads open, as its reported change did beside it,
                      // except where it mounts while the turn works: it would paint
                      // its whole diff only for the run to fold it a moment later.
                      defaultOpen={
                        openFileChanges && toolOutputDiffKey(entry.tool) ? true : undefined
                      }
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
              <TranscriptDiffCard
                block={entry.block}
                className="mt-0.5 mb-2 ml-[30px]"
                onOpenFile={onOpenFile}
              />
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

export function McpAppActivity({
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
