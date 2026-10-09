import { BrainIcon, ChevronRightIcon, LoaderCircleIcon } from 'lucide-react';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { TranscriptReasoning, type ThoughtSource } from './transcript-reasoning';
import { useTranscriptDisclosure } from './transcript-disclosure-context';

/** Show one reasoning preview with the exact recorded text behind its disclosure. */
export function TranscriptReasoningRow({
  text,
  streaming = false,
  source,
  id,
}: {
  text: string;
  streaming?: boolean;
  source?: ThoughtSource;
  id?: string;
}) {
  const [open, setOpen] = useTranscriptDisclosure(id ? `reasoning:${id}` : undefined);
  const preview = text
    .replace(/(\*\*|__|`)/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const label = streaming ? 'Thinking' : 'Reasoning';
  return (
    // The reader owns the disclosure. Streaming status belongs on the trigger,
    // rather than opting into Reasoning's automatic open/close behavior.
    <Reasoning className="mb-0" open={open} onOpenChange={setOpen}>
      <ReasoningTrigger aria-label={`${label}: ${preview}`} className="w-full min-w-0 py-1 text-xs">
        {streaming ? (
          <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <BrainIcon aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-left font-normal">{preview}</span>
        <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0" />
      </ReasoningTrigger>
      <TranscriptReasoning text={text} source={source}>
        <ReasoningContent className="ml-5 mt-1 leading-5 [&_p]:my-0.5">{text}</ReasoningContent>
      </TranscriptReasoning>
    </Reasoning>
  );
}
