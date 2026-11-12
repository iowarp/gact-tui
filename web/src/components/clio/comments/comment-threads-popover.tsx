import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCommentSession } from './comment-session';

/**
 * A surface's sent threads in a popover. Its open state is the comment session's, so a
 * transcript chip that opens the file can show them.
 */
export function CommentThreadsPopover({
  trigger,
  align,
  className,
  children,
}: {
  trigger: ReactNode;
  align: 'start' | 'end';
  className?: string;
  children: ReactNode;
}) {
  const session = useCommentSession();
  return (
    <Popover onOpenChange={session?.setThreadsOpen} open={session?.threadsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('max-h-[70dvh] w-[min(26rem,calc(100vw-1rem))] overflow-auto p-0', className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
