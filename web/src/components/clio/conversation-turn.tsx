import {
  BrainCircuitIcon,
  BrainIcon,
  ChevronDownIcon,
  EyeIcon,
  ListTreeIcon,
  MessageSquareTextIcon,
  WrenchIcon,
} from 'lucide-react';
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
import { getToolOutcome, getToolPresentation, getToolSummary } from './tool-presentation';
import { ClioToolInvocation } from './tool-invocation';

interface ConversationTurnProps {
  iterations: readonly ConversationIteration[];
  supplementalCalls: readonly SupplementalModelCall[];
  mode: ConversationDisplayMode;
  onModeChange: (mode: ConversationDisplayMode) => void;
}

/** Shared Full and Chain projection of the same authoritative iteration objects. */
export function ConversationTurn({
  iterations,
  supplementalCalls,
  mode,
  onModeChange,
}: ConversationTurnProps) {
  if (iterations.length === 0 && supplementalCalls.length === 0) return null;
  if (mode === 'full') {
    return (
      <section aria-label="Full agent activity" className="mb-4">
        <TurnHeader
          actionLabel="Use chain view for this turn"
          actionText="Chain view"
          count={iterations.length}
          onAction={() => onModeChange('chain')}
          title="Full agent activity"
        />
        <div className="mt-3 space-y-5">
          {iterations.map((iteration) => (
            <IterationDetail full iteration={iteration} key={iteration.id} />
          ))}
          {supplementalCalls.length > 0 ? (
            <SupplementalCalls calls={supplementalCalls} full />
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <ChainOfThought className="mb-4 space-y-2" defaultOpen>
      <div className="flex min-w-0 items-center gap-2">
        <ChainOfThoughtHeader className="min-h-8 min-w-0 flex-1">
          {iterations.length === 1 ? '1 agent iteration' : `${iterations.length} agent iterations`}
        </ChainOfThoughtHeader>
        <Button
          aria-label="Show full activity for this turn"
          className="shrink-0"
          onClick={() => onModeChange('full')}
          size="xs"
          title="Show every provider-thinking, response, and action block"
          variant="ghost"
        >
          <EyeIcon aria-hidden="true" />
          Full view
        </Button>
      </div>
      <ChainOfThoughtContent className="mt-2">
        {iterations.map((iteration) => (
          <IterationSummary iteration={iteration} key={iteration.id} />
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
  const [open, setOpen] = useState(full);
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
              <Reasoning defaultOpen={full}>
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

function TurnHeader({
  actionLabel,
  actionText,
  count,
  onAction,
  title,
}: {
  actionLabel: string;
  actionText: string;
  count: number;
  onAction: () => void;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2 font-medium">
        <ListTreeIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="truncate">{title}</span>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">
          {count === 1 ? '1 iteration' : `${count} iterations`}
        </span>
      </span>
      <Button aria-label={actionLabel} onClick={onAction} size="xs" variant="ghost">
        <BrainCircuitIcon aria-hidden="true" />
        {actionText}
      </Button>
    </div>
  );
}

function IterationSummary({ iteration }: { iteration: ConversationIteration }) {
  const [open, setOpen] = useState(iteration.streaming);
  const tool = iteration.tool ? getToolPresentation(iteration.tool) : undefined;
  const toolSummary = iteration.tool
    ? compactToolSummary(getToolSummary(iteration.tool))
    : undefined;
  const toolOutcome = iteration.tool ? getToolOutcome(iteration.tool) : undefined;
  const disclosureLabel = [
    `${open ? 'Collapse' : 'Expand'} iteration ${iteration.index + 1}: ${iteration.summary}`,
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
              <span className="block text-xs font-medium text-muted-foreground">
                {iteration.terminal ? 'Final iteration' : `Iteration ${iteration.index + 1}`}
              </span>
              <span className="mt-0.5 block text-sm text-foreground">{iteration.summary}</span>
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
          <IterationDetail iteration={iteration} />
        </CollapsibleContent>
      </ChainOfThoughtStep>
    </Collapsible>
  );
}

function IterationDetail({
  full = false,
  iteration,
}: {
  full?: boolean;
  iteration: ConversationIteration;
}) {
  return (
    <article
      aria-label={`${iteration.terminal ? 'Final iteration' : `Iteration ${iteration.index + 1}`} details`}
      className={cn(full && 'border-l-2 border-primary/35 pl-4')}
    >
      {full ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            {iteration.terminal ? 'Final iteration' : `Iteration ${iteration.index + 1}`}
          </span>
          {iteration.agentId && iteration.agentId !== 'main' ? (
            <span className="text-xs text-muted-foreground">Agent {iteration.agentId}</span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4">
        {iteration.thinking.length > 0 ? (
          iteration.thinking.map((thinking) => (
            <Reasoning
              className="mb-0"
              defaultOpen
              isStreaming={iteration.streaming}
              key={thinking.id}
            >
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
            Provider thinking was not returned for this iteration.
          </p>
        ) : null}

        {iteration.nextThoughts.map((thought, index) => (
          <section className="space-y-1.5" key={`${iteration.id}:response:${index}`}>
            <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <MessageSquareTextIcon aria-hidden="true" className="size-3.5" />
              {iteration.terminal ? 'Final thought' : 'Agent response'}
            </h4>
            <MessageResponse className="text-sm leading-6">{thought}</MessageResponse>
          </section>
        ))}

        {iteration.tool ? <ClioToolInvocation defaultOpen tool={iteration.tool} /> : null}
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
