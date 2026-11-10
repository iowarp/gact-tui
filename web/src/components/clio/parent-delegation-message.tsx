import type { Message as DomainMessage, MessageBlock } from '@clio/core/v3';
import { CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Dialog } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { copyText } from '@/lib/clipboard';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { formatClockTime, formatDateTime } from '@/lib/locale-format';
import { BoundedResult } from './bounded-result';
import { delegationPrompt, isParentDelegation } from './parent-delegation';
import { IconButton } from './primitives/icon-button';
import { ToolDetailsContent } from './tool-details-content';

type DelegationBlock = Extract<MessageBlock, { type: 'injection' }>;

/**
 * What the parent asked, drawn as the subagent tab's prompt (conversation-states
 * `.sab .ub`): a bare bubble whose time, copy and ⓘ Technical details sit in the
 * prompt footer, shown on hover as in the main transcript.
 */
export function ParentDelegationMessage({ message }: { message: DomainMessage }) {
  return message.blocks
    .filter(isParentDelegation)
    .map((block) => (
      <ParentAssignment key={block.id} block={block} createdAt={message.created_at} />
    ));
}

function ParentAssignment({ block, createdAt }: { block: DelegationBlock; createdAt: string }) {
  const lines = useTranscriptPreviewLines();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const prompt = delegationPrompt(block.text);
  return (
    <Message from="user" data-slot="parent-delegation">
      {/* The same capped, right-aligned frame as a person's prompt. Without
          it the bubble sizes to its longest unbreakable run (a path), and the
          end-aligned column pushes that overflow off its left edge (#834). */}
      <div
        className="group/prompt relative mb-1.5 ml-auto flex w-fit min-w-0 max-w-[80%] flex-col items-end"
        data-slot="parent-delegation-frame"
      >
        <MessageContent className="max-w-full">
          <div
            className="min-w-0 max-w-full rounded-xl bg-secondary px-3.5 py-[9px] font-sans text-[12.5px] leading-normal [overflow-wrap:anywhere]"
            data-slot="parent-delegation-bubble"
          >
            <BoundedResult lines={lines} title="Parent assignment">
              <MessageResponse>{prompt}</MessageResponse>
            </BoundedResult>
          </div>
        </MessageContent>
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          {/* As a person's prompt: a row under the bubble on phones; from sm it
              takes no height and shows left of the bubble on hover or focus. */}
          <div
            className="mt-0.5 flex h-[22px] max-w-full items-center justify-end gap-3 whitespace-nowrap text-[11.5px] text-muted-foreground sm:pointer-events-none sm:absolute sm:right-full sm:bottom-0 sm:mt-0 sm:mr-2 sm:opacity-0 sm:group-focus-within/prompt:pointer-events-auto sm:group-focus-within/prompt:opacity-100 sm:group-hover/prompt:pointer-events-auto sm:group-hover/prompt:opacity-100"
            data-slot="parent-delegation-actions"
          >
            <time dateTime={createdAt} title={formatDateTime(createdAt)}>
              {formatClockTime(createdAt)}
            </time>
            <TooltipProvider>
              <div className="flex items-center">
                <IconButton
                  icon={<CopyIcon aria-hidden="true" />}
                  label="Copy parent assignment"
                  onClick={() => void copyText(prompt)}
                  size="sm"
                  type="button"
                />
                <IconButton
                  icon={<InfoIcon aria-hidden="true" />}
                  label="Technical details for Parent assignment"
                  onClick={() => setDetailsOpen(true)}
                  size="sm"
                  type="button"
                />
              </div>
            </TooltipProvider>
          </div>
          <ToolDetailsContent inline={false} title="Parent assignment: Technical details">
            <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-6 [overflow-wrap:anywhere]">
              {block.text}
            </pre>
          </ToolDetailsContent>
        </Dialog>
      </div>
    </Message>
  );
}
