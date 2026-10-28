import type { MessageBlock } from '@clio/core/v3';
import { CircleCheckIcon, CircleXIcon, MessageSquareTextIcon, PencilLineIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { GroundedMessageResponse } from './grounded-message-response';

type NoticeBlock = Extract<MessageBlock, { type: 'notice' }>;
type TextBlock = Extract<MessageBlock, { type: 'text' }>;

const KINDS = {
  note: { icon: MessageSquareTextIcon, label: 'Note from', tone: 'text-muted-foreground' },
  check_passed: { icon: CircleCheckIcon, label: 'Check passed, by', tone: 'text-success' },
  check_failed: { icon: CircleXIcon, label: 'Check failed, by', tone: 'text-destructive' },
  revised: { icon: PencilLineIcon, label: 'Revised by', tone: 'text-muted-foreground' },
} as const;

const toggleClassName =
  'text-xs font-medium text-primary underline-offset-2 hover:text-primary/80 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * What a hook did with the answer, attributed to it: a note, a passed or failed
 * check, or a revision (with the original answer one click away). Each kind says
 * itself in words; the icon and color only repeat it.
 */
export function AnswerHookNotice({
  block,
  original,
  checkedOriginal = false,
}: {
  block: NoticeBlock;
  original?: TextBlock;
  /** The check ran before a later revision, so it judged the original answer. */
  checkedOriginal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kind = KINDS[block.code as keyof typeof KINDS] ?? KINDS.note;
  const Icon = kind.icon;
  const hook = block.metadata?.hook;
  const revised = block.code === 'revised';
  return (
    <section
      className="min-w-0 max-w-full text-sm"
      data-code={block.code}
      data-slot="answer-hook-notice"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <Icon aria-hidden="true" className={cn('size-4 shrink-0 self-center', kind.tone)} />
        <span className={cn('font-medium', kind.tone)}>
          {kind.label} <code className="break-all font-mono text-xs">{hook || 'a hook'}</code>
          {checkedOriginal ? ' on the original answer' : null}
          {block.text ? ': ' : null}
        </span>
        {block.text ? (
          <span className="min-w-0 whitespace-pre-wrap break-words text-foreground">
            {block.text}
          </span>
        ) : null}
        {revised && original ? (
          <button
            aria-expanded={open}
            className={toggleClassName}
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? 'Hide the original answer' : 'Show the original answer'}
          </button>
        ) : null}
      </div>
      {revised && original && open ? (
        <div className="mt-2 min-w-0 max-w-full break-words border-l-2 border-border pl-3 text-muted-foreground">
          <GroundedMessageResponse>{original.text}</GroundedMessageResponse>
        </div>
      ) : null}
    </section>
  );
}
