import { createContext } from 'react';
import type { SurfaceModel } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';

/** Own the raw definition model while retaining the kernel's resolved-node renderer. */
export const KernelSurfaceContext = createContext<
  SurfaceModel<ReactComponentImplementation> | undefined
>(undefined);
