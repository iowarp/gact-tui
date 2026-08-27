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
        <span
          aria-hidden="true"
          data-slot="stream-cursor"
          className="clio-stream-cursor ml-1 inline-block h-[1.05em] w-0.5 rounded-sm bg-primary align-[-0.15em] shadow-[0_0_12px_var(--primary)]"
        />
      ) : null}
    </div>
  );
}
