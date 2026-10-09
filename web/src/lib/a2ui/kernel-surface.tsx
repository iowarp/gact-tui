import { A2uiSurface as NodeSurface } from '@a2ui/react/v0_9';
import type { ComponentProps } from 'react';
import { KernelSurfaceContext } from './kernel-surface-context';

/** Supply component definitions without replacing the kernel's node lifecycle. */
export function A2uiSurface(props: ComponentProps<typeof NodeSurface>) {
  return (
    <KernelSurfaceContext.Provider value={props.surface}>
      <NodeSurface {...props} />
    </KernelSurfaceContext.Provider>
  );
}
