import { LazyMotion, MotionConfig } from 'motion/react';
import type { PropsWithChildren } from 'react';
import { useAppearancePreferences } from '@/providers/appearance-provider';

// Animation features load after first paint; `m` elements render statically until then.
const loadMotionFeatures = () => import('./motion-features').then((module) => module.default);

const clioTransition = {
  press: { duration: 0.08 },
  fast: { duration: 0.14, ease: [0.2, 0, 0, 1] as const },
  standard: { duration: 0.2, ease: [0.2, 0, 0, 1] as const },
};

export function ClioMotionProvider({ children }: PropsWithChildren) {
  const { motion } = useAppearancePreferences();
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig
        reducedMotion={motion === 'reduced' ? 'always' : 'user'}
        transition={clioTransition.standard}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
