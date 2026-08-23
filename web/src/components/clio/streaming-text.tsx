import { m, useAnimationControls, useReducedMotion } from 'motion/react';
import { useEffect, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { splitStreamingText } from './streaming-text-model';

export interface ClioStreamingTextProps extends HTMLAttributes<HTMLDivElement> {
  text: string;
  active?: boolean;
}

export function ClioStreamingText({ text, active, className, ...props }: ClioStreamingTextProps) {
  const reducedMotion = useReducedMotion();
  const trailingControls = useAnimationControls();
  const { stableText, trailingText } = splitStreamingText(
    text,
    Boolean(active),
    Boolean(reducedMotion),
  );

  useEffect(() => {
    if (!trailingText || reducedMotion) return;
    trailingControls.set({ opacity: 0.42 });
    void trailingControls.start({
      opacity: 1,
      transition: { duration: 0.14, ease: 'easeOut' },
    });
  }, [reducedMotion, trailingControls, trailingText]);

  return (
    <div
      aria-busy={active || undefined}
      aria-live={active ? 'polite' : undefined}
      className={cn('relative whitespace-pre-wrap', className)}
      {...props}
    >
      {stableText}
      {trailingText ? (
        <m.span animate={trailingControls} data-slot="stream-trail" initial={false}>
          {trailingText}
        </m.span>
      ) : null}
      {active ? (
        <m.span
          aria-hidden="true"
          className="ml-1 inline-block h-[1.05em] w-0.5 rounded-sm bg-primary align-[-0.15em] shadow-[0_0_12px_var(--primary)]"
          animate={
            reducedMotion ? { opacity: 0.8 } : { opacity: [0.35, 1, 0.35], scaleY: [0.8, 1, 0.8] }
          }
          transition={
            reducedMotion ? { duration: 0 } : { duration: 1.1, ease: 'easeInOut', repeat: Infinity }
          }
        />
      ) : null}
    </div>
  );
}
