import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useCommentRegion, useCommentSession } from './comment-session';

/**
 * A surface's sent threads in a popover. Its open state is the comment session's, so a
 * transcript chip that opens the file can show them. Like the spec's thread card it is
 * narrow and sits beside its trigger (`beside`, the comment palette at the frame's edge)
 * rather than over the document, and on a phone it stays short so the marks stay in view.
 * Beside the palette it is placed against the whole palette, not the button inside it, and
 * kept within the workbench pocket: left of the palette on a wide screen, above it on a phone.
 */
export function CommentThreadsPopover({
  trigger,
  align,
  beside = false,
  className,
  children,
}: {
  trigger: ReactNode;
  align: 'start' | 'end';
  beside?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const session = useCommentSession();
  const region = useCommentRegion();
  const narrow = useMediaQuery('(max-width: 40rem)');
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Radix's trigger also registers itself as the anchor, and a StrictMode ref replay leaves
  // that button (soon replaced, so measuring 0x0) in place after the palette anchor. A fresh
  // virtual element once mounted makes Radix take the palette again.
  const [anchorEpoch, setAnchorEpoch] = useState(0);
  // oxlint-disable-next-line react/set-state-in-effect -- re-registers Radix's anchor after its ref replay.
  useEffect(() => setAnchorEpoch(1), []);
  const palette = useMemo(
    () => ({
      current: {
        anchorEpoch,
        getBoundingClientRect: () => {
          const button = triggerRef.current;
          const panel = button?.closest('[data-slot="comment-controls"]') ?? button;
          return panel?.getBoundingClientRect() ?? new DOMRect();
        },
      },
    }),
    [anchorEpoch],
  );
  return (
    <Popover onOpenChange={session?.setThreadsOpen} open={session?.threadsOpen}>
      {beside ? <PopoverAnchor virtualRef={palette} /> : null}
      <PopoverTrigger asChild ref={triggerRef}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align={beside && !narrow ? 'end' : align}
        className={cn(
          'w-[min(18.75rem,calc(100vw-1rem))] overflow-auto p-0',
          narrow ? 'max-h-[40dvh]' : 'max-h-[min(60dvh,32rem)]',
          beside &&
            (narrow
              ? 'max-h-[min(40dvh,var(--radix-popover-content-available-height))]'
              : 'max-w-[max(12rem,var(--radix-popover-content-available-width))]'),
          className,
        )}
        collisionBoundary={beside ? region : undefined}
        collisionPadding={8}
        data-slot="comment-threads-popover"
        side={beside && !narrow ? 'left' : beside ? 'top' : 'bottom'}
        sideOffset={8}
        // The palette can be dragged while the card is open; the card follows it.
        updatePositionStrategy={beside ? 'always' : 'optimized'}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}