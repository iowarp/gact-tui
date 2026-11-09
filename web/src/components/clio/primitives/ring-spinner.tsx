import { cn } from '@/lib/utils';

/**
 * The spec's `.spin`: a teal arc turning on its own faint track, 12px by
 * default. Decorative; the words beside it say what is in progress. It turns
 * on its own compositor layer, so an idle wait does not repaint the page. With
 * reduced motion it holds still, and the arc on its track still reads as busy.
 */
export function RingSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="ring-spinner"
      className={cn(
        'block size-3 shrink-0 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin motion-safe:will-change-transform',
        className,
      )}
    />
  );
}
