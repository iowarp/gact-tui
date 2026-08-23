import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import type { PropsWithChildren } from 'react';

const clioTransition = {
  press: { duration: 0.08 },
  fast: { duration: 0.14, ease: [0.2, 0, 0, 1] as const },
  standard: { duration: 0.2, ease: [0.2, 0, 0, 1] as const },
};

export function ClioMotionProvider({ children }: PropsWithChildren) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={clioTransition.standard}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
