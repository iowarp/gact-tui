import { BrainCircuitIcon, BrainIcon, ChevronDownIcon, EyeIcon, WrenchIcon } from 'lucide-react';
import { useState } from 'react';
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
import type { ConversationIteration, SupplementalModelCall } from './conversation-turn-model';
import { ClioSubagentCard, type SubagentOpenTarget } from './subagent-card';
import { subagentsForTool } from './subagent-tool-link';
import { getToolOutcome, getToolPresentation, getToolSummary } from './tool-presentation';
import { ClioToolInvocation } from './tool-invocation';
import type { SubagentRun } from '@clio/core/v3';

interface ConversationTurnProps {
  authoritative: boolean;
  iterations: readonly ConversationIteration[];
  supplementalCalls: readonly SupplementalModelCall[];
  mode: ConversationDisplayMode;
  onModeChange: (mode: ConversationDisplayMode) => void;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
}

/** Shared Full and Chain projection of the same authoritative iteration objects. */
export function ConversationTurn({
  iterations,
  supplementalCalls,
  mode,
  onModeChange,
  onOpenSubagent,
  subagents,
}: ConversationTurnProps) {
  if (iterations.length === 0 && supplementalCalls.length === 0) return null;
  if (mode === 'full') {
    return (
      <section aria-label="Full agent activity" className="mb-4">
        <div className="mb-2 flex justify-end">
          <Button
            aria-label="Use chain view for this turn"
            onClick={() => onModeChange('chain')}
            size="xs"
            variant="ghost"
          >
            <BrainCircuitIcon aria-hidden="true" />
            Chain view
          </Button>
        </div>
        <div className="space-y-5">
          {iterations.map((iteration) => (
            <IterationDetail
              full
              iteration={iteration}
              key={iteration.id}
              onOpenSubagent={onOpenSubagent}
              subagents={subagents}
            />
          ))}
          {supplementalCalls.length > 0 ? (
            <SupplementalCalls calls={supplementalCalls} full />
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <ChainOfThought className="mb-4 space-y-2">
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
        {supplementalCalls.length > 0 ? <SupplementalCalls calls={supplementalCalls} /> : null}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function SupplementalCalls({
  calls,
  full = false,
}: {
  calls: readonly SupplementalModelCall[];
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label =
    calls.length === 1
      ? '1 additional captured model call'
      : `${calls.length} additional captured model calls`;
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div className={cn(full && 'border-l-2 border-muted-foreground/25 pl-4')}>
        <CollapsibleTrigger
          aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
          className="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrainCircuitIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">{label}</span>
            <span className="block">Exact iteration links were not recorded.</span>
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          {calls.map((call) => (
            <article className="space-y-3" key={call.id}>
              {call.question ? (
                <p className="text-xs text-muted-foreground">Prompt: {call.question}</p>
              ) : null}
              <Reasoning>
                <ReasoningTrigger getThinkingMessage={() => call.label} />
                <ReasoningContent className="[&_p]:my-1">{call.thinking}</ReasoningContent>
              </Reasoning>
              {call.response ? (
                <section className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground">Model response</h4>
                  <MessageResponse className="text-sm leading-6">{call.response}</MessageResponse>
                </section>
              ) : null}
            </article>
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
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
  const tool = iteration.tool ? getToolPresentation(iteration.tool) : undefined;
  const toolSummary = iteration.tool
    ? compactToolSummary(getToolSummary(iteration.tool))
    : undefined;
  const toolOutcome = iteration.tool ? getToolOutcome(iteration.tool) : undefined;
  const disclosureLabel = [
    `${open ? 'Collapse' : 'Expand'} activity: ${iteration.summary}`,
    tool?.title,
    toolSummary,
    toolOutcome?.label,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <ChainOfThoughtStep
        icon={iteration.tool ? WrenchIcon : BrainIcon}
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
                  <span className="min-w-0 truncate">{toolSummary}</span>
                  <span className="shrink-0">
                    {iteration.streaming ? 'Running' : (toolOutcome?.label ?? 'Completed')}
                  </span>
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
  iteration,
  onOpenSubagent,
  subagents,
}: {
  full?: boolean;
  iteration: ConversationIteration;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: Record<string, SubagentRun>;
}) {
  const linkedSubagents = subagentsForTool(iteration.tool, subagents);
  return (
    <article>
      <div className="space-y-4">
        {iteration.thinking.length > 0 ? (
          iteration.thinking.map((thinking) => (
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
        ) : full ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <BrainIcon aria-hidden="true" className="size-3.5" />
            Thinking was not returned for this step.
          </p>
        ) : null}

        {iteration.nextThoughts.map((thought, index) => (
          <MessageResponse className="text-sm leading-6" key={`${iteration.id}:response:${index}`}>
            {thought}
          </MessageResponse>
        ))}

        {iteration.tool ? <ClioToolInvocation tool={iteration.tool} /> : null}
        {linkedSubagents.map((subagent) => (
          <ClioSubagentCard key={subagent.id} onOpen={onOpenSubagent} subagent={subagent} />
        ))}
      </div>
    </article>
  );
}

function compactToolSummary(summary: string): string | undefined {
  if (/^(?:Completed successfully|Running now|Waiting to start)\.?$/iu.test(summary)) {
    return undefined;
  }
  return summary;
}
