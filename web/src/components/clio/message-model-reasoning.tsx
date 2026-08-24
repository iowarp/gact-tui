import type { Message, ModelReasoningCall } from '@clio/core/v3';
import { BrainIcon, EyeIcon } from 'lucide-react';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Button } from '@/components/ui/button';

interface MessageModelReasoningProps {
  message: Message;
}

/** Renders captured model-call reasoning that is not already present in the ordered ledger. */
export function MessageModelReasoning({ message }: MessageModelReasoningProps) {
  const calls = unrepresentedCalls(message);
  if (calls.length === 0) return null;

  return (
    <section aria-label="Additional captured model reasoning" className="space-y-3">
      {calls.map((call, index) => (
        <Reasoning
          className="mb-0 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5"
          defaultOpen
          key={call.id}
        >
          <ReasoningTrigger
            className="min-h-6"
            getThinkingMessage={() => modelCallLabel(call, index)}
          />
          <ReasoningContent className="mt-3 leading-6">{modelCallMarkdown(call)}</ReasoningContent>
        </Reasoning>
      ))}
    </section>
  );
}

interface MessageModelReasoningSummaryProps extends MessageModelReasoningProps {
  onShowFull: () => void;
}

/** Keeps metadata-only model calls discoverable without dumping them into condensed mode. */
export function MessageModelReasoningSummary({
  message,
  onShowFull,
}: MessageModelReasoningSummaryProps) {
  const calls = unrepresentedCalls(message);
  if (calls.length === 0) return null;

  return (
    <ChainOfThought className="rounded-xl border border-border/70 bg-muted/10 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <ChainOfThoughtHeader className="min-h-7 min-w-0 flex-1">
          {calls.length === 1 ? 'Captured model reasoning' : `${calls.length} captured model calls`}
        </ChainOfThoughtHeader>
        <Button
          aria-label="Show full captured model reasoning"
          className="shrink-0"
          onClick={onShowFull}
          size="xs"
          variant="ghost"
        >
          <EyeIcon aria-hidden="true" />
          Full activity
        </Button>
      </div>
      <ChainOfThoughtContent>
        {calls.map((call, index) => (
          <ChainOfThoughtStep
            description={`${call.reasoning_chars.toLocaleString()} captured characters`}
            icon={BrainIcon}
            key={call.id}
            label={modelCallLabel(call, index)}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function unrepresentedCalls(message: Message): ModelReasoningCall[] {
  const represented = new Set<string>();
  for (const block of message.blocks) {
    if (block.type === 'reasoning') represented.add(normalize(block.text));
    if (block.type === 'tool' && block.thought) represented.add(normalize(block.thought));
  }
  return (message.reasoning_calls ?? []).filter(
    (call) => !represented.has(normalize(call.reasoning)),
  );
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function modelCallLabel(call: ModelReasoningCall, index: number): string {
  const model = call.model?.split('/').at(-1);
  return model ? `${model} reasoning` : `Model call ${index + 1} reasoning`;
}

function modelCallMarkdown(call: ModelReasoningCall): string {
  return [
    call.reasoning,
    call.question ? `### Model input\n\n${call.question}` : '',
    call.response ? `### Raw model response\n\n${call.response}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
