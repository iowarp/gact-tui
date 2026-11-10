import type { MessageBlock } from '@clio/core/v3';
import { FileCode2Icon, PanelsTopLeftIcon } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { Button } from '@/components/ui/button';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { BoundedResult } from './bounded-result';

/** A file change the agent reported, shown where it happened in the transcript. */
export function TranscriptDiffCard({
  block,
  onOpenFile,
}: {
  block: Extract<MessageBlock, { type: 'diff' }>;
  onOpenFile?: (path: string) => void;
}) {
  const previewLines = useTranscriptPreviewLines();
  return (
    <BoundedResult lines={previewLines} title="File changes">
      <CodeBlock code={withoutFileHeaders(block.unified_diff)} language="diff" showLineNumbers>
        <CodeBlockHeader>
          <CodeBlockTitle>
            <FileCode2Icon aria-hidden="true" className="size-3.5" />
            <CodeBlockFilename>{block.path}</CodeBlockFilename>
          </CodeBlockTitle>
          <CodeBlockActions>
            {onOpenFile ? (
              <Button
                aria-label={`Open ${block.path} in workspace`}
                onClick={() => onOpenFile(block.path)}
                size="icon-xs"
                variant="ghost"
              >
                <PanelsTopLeftIcon aria-hidden="true" />
              </Button>
            ) : null}
            <CodeBlockCopyButton
              aria-label={`Copy diff for ${block.path}`}
              value={block.unified_diff}
            />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </BoundedResult>
  );
}

/** A diff's ``---``/``+++`` file lines repeat the path its header shows; the preview's
 *  few lines go to the change itself (Copy keeps the whole diff). */
function withoutFileHeaders(diff: string): string {
  const lines = diff.split('\n');
  let start = 0;
  while (start < lines.length && /^(---|\+\+\+) /u.test(lines[start]!)) start += 1;
  return start > 0 && start < lines.length ? lines.slice(start).join('\n') : diff;
}
