import type { ComponentApi } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { createElement, useRef } from 'react';

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
  const original = kernelComponent as unknown as ReactComponentImplementation;
  const wrapped: ReactComponentImplementation = {
    name: catalogComponentName,
    schema: original.schema,
    render: function WrappedKernelComponent(rendererProps) {
      const model = rendererProps.context.componentModel;
      const current = model.properties;
      const missing = Object.entries(presets ?? {}).filter(([key]) => !(key in current));
      if (missing.length > 0) {
        model.properties = { ...Object.fromEntries(missing), ...current };
      }
      // A contents wrapper keeps the component's own layout and flex sizing,
      // while giving every catalog component a stable capture address.
      const attributes = {
        'data-a2ui-component-id': model.id,
        'data-a2ui-capture-wrapper': '',
        style: { display: 'contents' },
      };
      // Upstream's binding snapshot merges old optional props. A complete
      // component replacement must also remove omitted properties (for example
      // a chart preset when switching to an authored spec), across all catalogs.
      // A new context rebuilds the binder when a definition changes, retaining
      // the existing component and shared data model (including human input).
      const binding = useRef<
        | {
            source: typeof rendererProps.context;
            properties: typeof model.properties;
            context: typeof rendererProps.context;
          }
        | undefined
      >(undefined);
      if (
        !binding.current ||
        binding.current.source !== rendererProps.context ||
        binding.current.properties !== model.properties
      ) {
        binding.current = {
          source: rendererProps.context,
          properties: model.properties,
          context: Object.assign(
            Object.create(Object.getPrototypeOf(rendererProps.context)),
            rendererProps.context,
          ),
        };
      }
      const content = original.render({ ...rendererProps, context: binding.current.context });
      if (content instanceof Promise)
        return content.then((resolved) => createElement('div', attributes, resolved));
      return createElement('div', attributes, content);
    },
  };
  return wrapped as unknown as T;
}
