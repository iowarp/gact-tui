import { BrainIcon, ChevronDownIcon, ListChecksIcon, WrenchIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ClioRepository, PendingInteraction, SubagentRun, Task } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { ClioStatus, clioStatusLabel } from './status';
import {
  ClioSubagentCard,
  ClioSubagentLifecycleLine,
  type SubagentOpenTarget,
} from './subagent-card';
import { subagentsForTool } from './subagent-tool-link';
import { getToolPresentation, getToolSummary } from './tool-presentation';
import { ClioToolInvocation } from './tool-invocation';
import { AgentAnswerActivity } from './agent-answer-activity';
import { questionInteractionsForTool } from './agent-answer-domain';
import { McpAppHistoryLine, McpAppSurface } from './mcp-app-surface';
import { GroundedMessageResponse } from './grounded-message-response';

type McpAppActivityEntry = Extract<ConversationIteration['activity'][number], { kind: 'mcp_app' }>;

interface ConversationTurnProps {
  iterations: readonly ConversationIteration[];
  mode: 'chain' | 'full';
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  activeMcpAppId?: string;
  mcpAppRepository?: ClioRepository;
  messageSessionId?: string;
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
}: ConversationTurnProps) {
  if (iterations.length === 0) return null;
  if (mode === 'full') {
    return (
      <section aria-label="Full agent activity" className="mb-4">
        <div className="space-y-4">
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
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <ChainOfThought className="mb-4 space-y-2" defaultOpen>
      <ChainOfThoughtHeader className="min-h-8">Activity</ChainOfThoughtHeader>
      <ChainOfThoughtContent className="mt-2">
        {iterations.map((iteration) => (
          <IterationSummary
            iteration={iteration}
            key={iteration.id}
            onOpenSubagent={onOpenSubagent}
            subagents={subagents}
            interactions={interactions}
            activeMcpAppId={activeMcpAppId}
            mcpAppRepository={mcpAppRepository}
            messageSessionId={messageSessionId}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function IterationSummary({
  iteration,
  onOpenSubagent,
  subagents,
  interactions,
  activeMcpAppId,
  mcpAppRepository,
  messageSessionId,
}: {
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  activeMcpAppId?: string;
  mcpAppRepository?: ClioRepository;
  messageSessionId?: string;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const open = iteration.streaming || manualOpen;
  const appEvents = iteration.activity.filter(
    (entry): entry is McpAppActivityEntry => entry.kind === 'mcp_app',
  );
  const subagentEvents = iteration.activity.filter(
    (entry): entry is Extract<ConversationIteration['activity'][number], { kind: 'subagent' }> =>
      entry.kind === 'subagent',
  );
  const primaryTool = iteration.tools[0];
  const tool = primaryTool ? getToolPresentation(primaryTool) : undefined;
  const toolSummary = primaryTool ? getToolSummary(primaryTool) : undefined;
  const toolState = iteration.streaming
    ? clioStatusLabel('running')
    : primaryTool && primaryTool.state !== 'succeeded'
      ? clioStatusLabel(primaryTool.state)
      : undefined;
  const disclosureLabel = [
    `${open ? 'Collapse' : 'Expand'} activity: ${iteration.summary}`,
    tool?.title,
    toolSummary,
    toolState,
    ...iteration.tasks.map((task) => `${task.title}: ${clioStatusLabel(task.state)}`),
    iteration.interrupted ? 'Interrupted' : undefined,
  ]
    .filter(Boolean)
    .map((segment) => String(segment).trim().replace(/[.]+$/u, ''))
    .join('. ');
  return (
    <>
      <Collapsible onOpenChange={setManualOpen} open={open}>
        <ChainOfThoughtStep
          icon={BrainIcon}
          label={
            <CollapsibleTrigger
              aria-label={disclosureLabel}
              className="group flex w-full min-w-0 items-start gap-2 rounded-md py-0.5 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{iteration.summary}</span>
                {tool ? (
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <WrenchIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{tool.title}</span>
                    {toolSummary ? <span className="min-w-0 truncate">{toolSummary}</span> : null}
                    {toolState ? <span className="shrink-0">{toolState}</span> : null}
                    {iteration.tools.length > 1 ? (
                      <span className="shrink-0">+{iteration.tools.length - 1}</span>
                    ) : null}
                  </span>
                ) : null}
                {iteration.tasks.map((task) => (
                  <TaskActivityLine className="mt-1" key={task.id} task={task} />
                ))}
                {iteration.tools.flatMap((tool) =>
                  questionInteractionsForTool(interactions, tool.id).map((interaction) => (
                    <AgentAnswerActivity compact interaction={interaction} key={interaction.id} />
                  )),
                )}
                {iteration.interrupted && !open ? (
                  <ClioStatus className="mt-1" value="interrupted" />
                ) : null}
              </span>
              <ChevronDownIcon
                aria-hidden="true"
                className={cn('mt-1 size-4 shrink-0 transition-transform', open && 'rotate-180')}
              />
            </CollapsibleTrigger>
          }
        >
          {subagentEvents.length > 0 ? (
            <div className="mb-1 mt-1 space-y-0.5">
              {subagentEvents.map((entry) => (
                <ClioSubagentLifecycleLine
                  key={`subagent:${entry.id}`}
                  onOpen={onOpenSubagent}
                  stage={entry.block.stage ?? 'delegate.unknown'}
                  subagent={subagents[entry.block.subagent_id]}
                  task={entry.block.task}
                />
              ))}
            </div>
          ) : null}
          <CollapsibleContent className="pt-2">
            <IterationDetail
              activeMcpAppId={activeMcpAppId}
              hiddenMcpAppIds={appEvents.map((entry) => entry.block.app_instance_id)}
              interactions={interactions}
              iteration={iteration}
              mcpAppRepository={mcpAppRepository}
              messageSessionId={messageSessionId}
              onOpenSubagent={onOpenSubagent}
              showSubagents={false}
              showTasks={false}
              subagents={subagents}
            />
          </CollapsibleContent>
        </ChainOfThoughtStep>
      </Collapsible>
      {appEvents.map((entry) => (
        <McpAppActivity
          activeMcpAppId={activeMcpAppId}
          entry={entry}
          key={`mcp-app:${entry.id}`}
          mcpAppRepository={mcpAppRepository}
          messageSessionId={messageSessionId}
        />
      ))}
    </>
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
  activeMcpAppId,
  hiddenMcpAppIds,
  mcpAppRepository,
  messageSessionId,
}: {
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  showTasks?: boolean;
  showSubagents?: boolean;
  showQuestionInteractions?: boolean;
  activeMcpAppId?: string;
  hiddenMcpAppIds?: readonly string[];
  mcpAppRepository?: ClioRepository;
  messageSessionId?: string;
}) {
  const explicitSubagentIds = new Set(
    iteration.activity.flatMap((entry) =>
      entry.kind === 'subagent' ? [entry.block.subagent_id] : [],
    ),
  );
  return (
    <article>
      <div className="space-y-4">
        {iteration.thinking.length > 0
          ? iteration.thinking.map((thinking) => (
              <Reasoning className="mb-0" isStreaming={thinking.streaming} key={thinking.id}>
                <ReasoningTrigger
                  className="min-h-7"
                  getThinkingMessage={(streaming) =>
                    streaming ? `${thinking.label} in progress` : thinking.label
                  }
                />
                <ReasoningContent className="mt-2 leading-6 [&_p]:my-1">
                  {thinking.text}
                </ReasoningContent>
              </Reasoning>
            ))
          : null}

        {iteration.nextThoughts.map((thought, index) => (
          <GroundedMessageResponse
            className="text-sm leading-6"
            key={`${iteration.id}:response:${index}`}
          >
            {thought}
          </GroundedMessageResponse>
        ))}

        {/*
          One ordered lane: a Task carries no owning-tool field, so its position
          beside a tool is the only record of what it belongs to. Rendering all
          tools and then all tasks would destroy that correlation.
        */}
        {iteration.activity.map((entry) =>
          entry.kind === 'tool' ? (
            <Fragment key={`tool:${entry.id}`}>
              <div className="space-y-2" data-turn-activity={`tool:${entry.id}`}>
                <ClioToolInvocation tool={entry.tool} />
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
                    <AgentAnswerActivity interaction={interaction} key={interaction.id} />
                  ))
                : null}
            </Fragment>
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
