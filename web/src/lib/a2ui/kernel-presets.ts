import type { ComponentApi } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';

/**
 * Wraps a kernel component under a catalog's own component name, applying
 * the sidecar's `presets` (`_Implementation.presets`) as fallback prop
 * values for keys the wire never set on a given instance. The merge mutates
 * the component's model once, the first time it is missing a preset key, so
 * it is idempotent and never loops (`ComponentModel.properties`'s setter
 * fires `onUpdated`, which would otherwise re-trigger a binder rebuild every
 * render for a plain reassignment).
 */
export function wrapKernelComponentWithPresets<T extends ComponentApi>(
  kernelComponent: T,
  catalogComponentName: string,
  presets: Record<string, string> | undefined,
): T {
  if (!presets || Object.keys(presets).length === 0) {
    return { ...kernelComponent, name: catalogComponentName };
  }
  const original = kernelComponent as unknown as ReactComponentImplementation;
  const wrapped: ReactComponentImplementation = {
    name: catalogComponentName,
    schema: original.schema,
    render: (rendererProps) => {
      const model = rendererProps.context.componentModel;
      const current = model.properties;
      const missing = Object.entries(presets).filter(([key]) => !(key in current));
      if (missing.length > 0) {
        model.properties = { ...Object.fromEntries(missing), ...current };
      }
      return original.render(rendererProps);
    },
  };
  return wrapped as unknown as T;
}
