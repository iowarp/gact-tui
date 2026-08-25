import { BrainCircuitIcon, BrainIcon, ChevronDownIcon, EyeIcon, WrenchIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';
import type { ConversationIteration } from './conversation-turn-model';
import { ClioSubagentCard, type SubagentOpenTarget } from './subagent-card';
import { subagentsForTool } from './subagent-tool-link';
import { getToolOutcome, getToolPresentation, getToolSummary } from './tool-presentation';
import { ClioToolInvocation } from './tool-invocation';
import type { SubagentRun } from '@clio/core/v3';

interface ConversationTurnProps {
  iterations: readonly ConversationIteration[];
  mode: ConversationDisplayMode;
  onModeChange: (mode: ConversationDisplayMode) => void;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
}

/** Shared Full and Chain projection of the same authoritative iteration objects. */
export function ConversationTurn({
  iterations,
  mode,
  onModeChange,
  onOpenSubagent,
  subagents,
}: ConversationTurnProps) {
  if (iterations.length === 0) return null;
  if (mode === 'full') {
    return (
      <section aria-label="Full agent activity" className="mb-4">
        <div className="space-y-5">
          {iterations.map((iteration, index) => (
            <IterationDetail
              full
              headerAction={
                index === 0 ? (
                  <Button
                    aria-label="Use chain view for this turn"
                    className="shrink-0"
                    onClick={() => onModeChange('chain')}
                    size="xs"
                    variant="ghost"
                  >
                    <BrainCircuitIcon aria-hidden="true" />
                    Chain
                  </Button>
                ) : undefined
              }
              iteration={iteration}
              key={iteration.id}
              onOpenSubagent={onOpenSubagent}
              subagents={subagents}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <ChainOfThought className="mb-4 space-y-2" defaultOpen>
      <div className="flex min-w-0 items-center gap-2">
        <ChainOfThoughtHeader className="min-h-8 min-w-0 flex-1">Activity</ChainOfThoughtHeader>
        <Button
          aria-label="Show full activity for this turn"
          className="shrink-0"
          onClick={() => onModeChange('full')}
          size="xs"
          title="Show every thinking, response, and action block"
          variant="ghost"
        >
          <EyeIcon aria-hidden="true" />
          Full view
        </Button>
      </div>
      <ChainOfThoughtContent className="mt-2">
        {iterations.map((iteration) => (
          <IterationSummary
            iteration={iteration}
            key={iteration.id}
            onOpenSubagent={onOpenSubagent}
            subagents={subagents}
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
}: {
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
}) {
  const [open, setOpen] = useState(false);
  const primaryTool = iteration.tools[0];
  const tool = primaryTool ? getToolPresentation(primaryTool) : undefined;
  const toolSummary = primaryTool ? compactToolSummary(getToolSummary(primaryTool)) : undefined;
  const toolOutcome = primaryTool ? getToolOutcome(primaryTool) : undefined;
  const toolState = iteration.streaming
    ? 'Running'
    : primaryTool && primaryTool.state !== 'succeeded'
      ? toolOutcome?.label
      : undefined;
  const disclosureLabel = [
    `${open ? 'Collapse' : 'Expand'} activity: ${iteration.summary}`,
    tool?.title,
    toolSummary,
    toolState,
  ]
    .filter(Boolean)
    .map((segment) => String(segment).trim().replace(/[.]+$/u, ''))
    .join('. ');
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
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
            subagents={subagents}
          />
        </CollapsibleContent>
      </ChainOfThoughtStep>
    </Collapsible>
  );
}

function IterationDetail({
  full = false,
  headerAction,
  iteration,
  onOpenSubagent,
  subagents,
}: {
  full?: boolean;
  headerAction?: ReactNode;
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
}) {
  return (
    <article>
      <div className="space-y-4">
        {iteration.thinking.length > 0 ? (
          iteration.thinking.map((thinking, index) => (
            <Reasoning className="mb-0" isStreaming={thinking.streaming} key={thinking.id}>
              <div className="flex min-w-0 items-center gap-2">
                <ReasoningTrigger
                  className="min-h-7 min-w-0 flex-1"
                  getThinkingMessage={(streaming) =>
                    streaming ? `${thinking.label} in progress` : thinking.label
                  }
                />
                {index === 0 ? headerAction : null}
              </div>
              <ReasoningContent className="mt-2 leading-6 [&_p]:my-1">
                {thinking.text}
              </ReasoningContent>
            </Reasoning>
          ))
        ) : headerAction ? (
          <div className="flex justify-end">{headerAction}</div>
        ) : null}

        {iteration.nextThoughts.map((thought, index) => (
          <MessageResponse className="text-sm leading-6" key={`${iteration.id}:response:${index}`}>
            {thought}
          </MessageResponse>
        ))}

        {iteration.tools.map((tool) => (
          <div className="space-y-2" key={tool.id}>
            <ClioToolInvocation tool={tool} />
            {subagentsForTool(tool, subagents).map((subagent) => (
              <ClioSubagentCard key={subagent.id} onOpen={onOpenSubagent} subagent={subagent} />
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

function compactToolSummary(summary: string): string | undefined {
  if (
    /^(?:Completed(?: successfully)?|Succeeded|Running(?: now)?|Waiting to start)\.?$/iu.test(
      summary,
    )
  ) {
    return undefined;
  }
  return summary;
}
