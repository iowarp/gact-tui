import { BrainIcon, ChevronRightIcon, LoaderCircleIcon, MessageCircleIcon } from 'lucide-react';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { TranscriptReasoning, type ThoughtSource } from './transcript-reasoning';

/** Show one reasoning preview with the exact recorded text behind its disclosure. */
export function TranscriptReasoningRow({
  text,
  streaming = false,
  source,
  kind = 'reasoning',
}: {
  text: string;
  streaming?: boolean;
  source?: ThoughtSource;
  kind?: 'reasoning' | 'update';
}) {
  const preview = text
    .replace(/(\*\*|__|`)/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const label = kind === 'update' ? 'Update' : streaming ? 'Thinking' : 'Reasoning';
  return (
    <Reasoning className="mb-0" defaultOpen={false} isStreaming={streaming}>
      <ReasoningTrigger aria-label={`${label}: ${preview}`} className="w-full min-w-0 py-1 text-xs">
        {streaming ? (
          <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
        ) : kind === 'update' ? (
          <MessageCircleIcon aria-hidden="true" className="size-3.5 shrink-0" />
        ) : (
          <BrainIcon aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0 font-medium">{label}</span>
        <span className="min-w-0 flex-1 truncate text-left font-normal">{preview}</span>
        <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0" />
      </ReasoningTrigger>
      <TranscriptReasoning text={text} source={source}>
        <ReasoningContent className="ml-5 mt-1 leading-5 [&_p]:my-0.5">{text}</ReasoningContent>
      </TranscriptReasoning>
    </Reasoning>
  );
}
