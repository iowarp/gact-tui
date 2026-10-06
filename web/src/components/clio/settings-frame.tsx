import type { ComponentProps } from 'react';
import {
  Frame as ReuiFrame,
  FrameHeader as ReuiFrameHeader,
  FramePanel as ReuiFramePanel,
  FrameFooter as ReuiFrameFooter,
  FrameTitle as ReuiFrameTitle,
  FrameDescription as ReuiFrameDescription,
} from '@/components/reui/frame';
import { cn } from '@/lib/utils';

/** ReUI groups adapted for settings rows, without nested card decoration. */
export function Frame({ className, ...props }: ComponentProps<typeof ReuiFrame>) {
  return (
    <ReuiFrame
      {...props}
      variant="ghost"
      dense={false}
      stacked={false}
      className={cn('grid gap-2 rounded-none border-0 bg-transparent p-0', className)}
    />
  );
}
export function FrameHeader({ className, ...props }: ComponentProps<typeof ReuiFrameHeader>) {
  return (
    <ReuiFrameHeader
      {...props}
      className={cn('gap-1 border-b border-border/60 px-0 pb-3 pt-2', className)}
    />
  );
}
export function FrameTitle({ className, ...props }: ComponentProps<typeof ReuiFrameTitle>) {
  return (
    <ReuiFrameTitle
      {...props}
      role="heading"
      aria-level={2}
      className={cn('text-sm font-semibold', className)}
    />
  );
}
export function FrameDescription({
  className,
  ...props
}: ComponentProps<typeof ReuiFrameDescription>) {
  return (
    <ReuiFrameDescription
      {...props}
      className={cn('text-sm leading-5 text-muted-foreground', className)}
    />
  );
}
export function FramePanel({ className, ...props }: ComponentProps<typeof ReuiFramePanel>) {
  return (
    <ReuiFramePanel
      {...props}
      className={cn(
        className,
        'rounded-none border-0 bg-transparent px-0 py-2 shadow-none before:hidden',
      )}
    />
  );
}
export function FrameFooter({ className, ...props }: ComponentProps<typeof ReuiFrameFooter>) {
  return (
    <ReuiFrameFooter
      {...props}
      className={cn('flex flex-wrap items-center gap-3 px-0 py-2', className)}
    />
  );
}
