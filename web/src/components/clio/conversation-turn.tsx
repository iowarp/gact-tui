import { BrainIcon, ChevronDownIcon, ListChecksIcon, WrenchIcon } from 'lucide-react';
import { useState } from 'react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { PendingInteraction, SubagentRun, Task } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { ClioStatus, clioStatusLabel } from './status';
import { ClioSubagentCard, type SubagentOpenTarget } from './subagent-card';
import { subagentsForTool } from './subagent-tool-link';
import { getToolPresentation, getToolSummary } from './tool-presentation';
import { ClioToolInvocation } from './tool-invocation';
import { AgentAnswerActivity } from './agent-answer-activity';
import { agentInteractionsForTool } from './agent-answer-domain';

interface ConversationTurnProps {
  iterations: readonly ConversationIteration[];
  mode: 'chain' | 'full';
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
}

/** Shared Full and Chain projection of the same authoritative iteration objects. */
export function ConversationTurn({
  iterations,
  mode,
  onOpenSubagent,
  subagents,
  interactions,
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
}: {
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const open = iteration.streaming || manualOpen;
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
                agentInteractionsForTool(interactions, tool.id).map((interaction) => (
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
        <CollapsibleContent className="pt-2">
          <IterationDetail
            iteration={iteration}
            onOpenSubagent={onOpenSubagent}
            showTasks={false}
            subagents={subagents}
            interactions={interactions}
          />
        </CollapsibleContent>
      </ChainOfThoughtStep>
    </Collapsible>
  );
}

function IterationDetail({
  iteration,
  onOpenSubagent,
  subagents,
  interactions,
  showTasks = true,
  showAgentInteractions = true,
}: {
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
  interactions?: readonly PendingInteraction[];
  showTasks?: boolean;
  showAgentInteractions?: boolean;
}) {
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
          <MessageResponse className="text-sm leading-6" key={`${iteration.id}:response:${index}`}>
            {thought}
          </MessageResponse>
        ))}

        {/*
          One ordered lane: a Task carries no owning-tool field, so its position
          beside a tool is the only record of what it belongs to. Rendering all
          tools and then all tasks would destroy that correlation.
        */}
        {iteration.activity.map((entry) =>
          entry.kind === 'tool' ? (
            <div
              className="space-y-2"
              data-turn-activity={`tool:${entry.id}`}
              key={`tool:${entry.id}`}
            >
              <ClioToolInvocation
                agentInteractions={
                  showAgentInteractions
                    ? agentInteractionsForTool(interactions, entry.id)
                    : undefined
                }
                tool={entry.tool}
              />
              {subagentsForTool(entry.tool, subagents).map((subagent) => (
                <ClioSubagentCard key={subagent.id} onOpen={onOpenSubagent} subagent={subagent} />
              ))}
            </div>
          ) : showTasks ? (
            <TaskActivityLine key={`task:${entry.id}`} task={entry.task} />
          ) : null,
        )}
        {iteration.interrupted ? <ClioStatus value="interrupted" /> : null}
      </div>
    </article>
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
