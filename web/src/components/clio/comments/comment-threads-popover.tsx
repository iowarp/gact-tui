import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useCommentRegion, useCommentSession } from './comment-session';

/** The spec's thread card width (`.thr`), in rem. */
const CARD_REM = 18.75;
const SIDE_OFFSET = 8;
const EDGE = 8;

/**
 * A surface's sent threads in a popover. Its open state is the comment session's, so a
 * transcript chip that opens the file can show them. Like the spec's thread card it is
 * narrow and sits beside its trigger (`beside`, the comment palette at the frame's edge)
 * rather than over the document, and on a phone it stays short so the marks stay in view.
 * Beside the palette it is placed against the whole palette, not the button inside it, and
 * kept within the workbench pocket: left of the palette when the full card fits there,
 * otherwise (a narrow pocket, a phone) above it.
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
  // The card keeps the spec's 300 px: with less room beside the palette it goes above it.
  const [roomBeside, setRoomBeside] = useState(true);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = session ? session.threadsOpen : ownOpen;
  const setOpen = session ? session.setThreadsOpen : setOwnOpen;
  useLayoutEffect(() => {
    if (!beside || narrow || !open) return;
    const measure = () => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const start = region?.getBoundingClientRect().left ?? 0;
      const room = palette.current.getBoundingClientRect().left - start - SIDE_OFFSET - EDGE;
      setRoomBeside(room >= CARD_REM * rem);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [beside, narrow, open, palette, region]);
  const above = beside && (narrow || !roomBeside);
  return (
    <Popover onOpenChange={setOpen} open={open}>
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
              : above
                ? 'max-h-[min(60dvh,32rem,var(--radix-popover-content-available-height))]'
                : 'max-w-[max(12rem,var(--radix-popover-content-available-width))]'),
          className,
        )}
        collisionBoundary={beside ? region : undefined}
        collisionPadding={EDGE}
        data-slot="comment-threads-popover"
        side={!beside ? 'bottom' : above ? 'top' : 'left'}
        sideOffset={SIDE_OFFSET}
        // The palette can be dragged while the card is open; the card follows it.
        updatePositionStrategy={beside ? 'always' : 'optimized'}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
