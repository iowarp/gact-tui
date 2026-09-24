import { m, useIsPresent } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Fades a transcript-area child in/out across an `AnimatePresence` swap
 * (e.g. hydrating -> live conversation) without unmounting it mid-exit.
 *
 * Extracted from `workspace-page.tsx` (which owns every other piece of this
 * route) purely to stay under the file-size ratchet -- this component closes
 * over nothing from that route beyond its own props.
 */
export function TranscriptPresenceSurface({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const isPresent = useIsPresent();
  return (
    <m.div
      animate={{ opacity: 1 }}
      aria-hidden={!isPresent}
      className={className}
      exit={{ opacity: 0 }}
      inert={!isPresent}
      initial={{ opacity: 0 }}
    >
      {children}
    </m.div>
  );
}
