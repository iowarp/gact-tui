import { createContext } from 'react';

/** Return to the composer before executing a reference action from an expanded view. */
export const SurfaceReferenceContext = createContext<((reference: () => void) => void) | undefined>(
  undefined,
);
