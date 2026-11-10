import type { MessageBlock } from '@clio/core/v3';
import { cn } from '@/lib/utils';
import { TranscriptDiffBody } from './transcript-tool-bodies';

/** A file change the agent reported, shown where it happened in the transcript. */
export function TranscriptDiffCard({
  block,
  onOpenFile,
  className,
}: {
  block: Extract<MessageBlock, { type: 'diff' }>;
  onOpenFile?: (path: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
      data-slot="transcript-diff-card"
    >
      <TranscriptDiffBody
        block={{ id: block.id, type: 'diff', path: block.path, text: block.unified_diff }}
        onOpen={onOpenFile ? () => onOpenFile(block.path) : undefined}
      />
    </div>
  );
}
