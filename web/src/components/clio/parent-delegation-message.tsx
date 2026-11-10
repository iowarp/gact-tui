import type { Message as DomainMessage } from '@clio/core/v3';
import { BotIcon, CopyIcon } from 'lucide-react';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { copyText } from '@/lib/clipboard';
import { BoundedResult } from './bounded-result';
import { delegationPrompt, isParentDelegation } from './parent-delegation';

/** Show what the parent asked as a readable message, with exact evidence on demand. */
export function ParentDelegationMessage({ message }: { message: DomainMessage }) {
  const lines = useTranscriptPreviewLines();
  return message.blocks.filter(isParentDelegation).map((block) => {
    const prompt = delegationPrompt(block.text);
    return (
      <Message from="user" key={block.id} data-slot="parent-delegation">
        {/* The same capped, right-aligned frame as a person's prompt. Without
            it the bubble sizes to its longest unbreakable run (a path), and the
            end-aligned column pushes that overflow off its left edge (#834). */}
        <div
          className="mb-1.5 ml-auto flex w-fit min-w-0 max-w-[80%] flex-col items-end"
          data-slot="parent-delegation-frame"
        >
          <div
            className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"
            data-slot="conversation-message-sender"
          >
            <BotIcon aria-hidden="true" className="size-4" />
            <span>Parent</span>
            <time dateTime={message.created_at}>
              {new Date(message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>
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
          <div className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer py-2">Technical details</summary>
              <BoundedResult lines={lines} title="Original delegation">
                <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{block.text}</pre>
              </BoundedResult>
            </details>
            <MessageActions>
              <MessageAction
                label="Copy parent assignment"
                tooltip="Copy assignment"
                onClick={() => void copyText(prompt)}
              >
                <CopyIcon aria-hidden="true" className="size-4" />
              </MessageAction>
            </MessageActions>
          </div>
        </div>
      </Message>
    );
  });
}
