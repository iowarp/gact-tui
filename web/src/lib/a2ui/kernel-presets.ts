import type { ComponentApi, ComponentContext } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useSignalValue } from '@a2ui/react/v0_9';
import { createElement, useContext, useLayoutEffect, useRef } from 'react';
import { KernelSurfaceContext } from './kernel-surface-context';

/** Write through the kernel's imperative model API, outside React's props. */
function replaceModelProperties(
  model: ComponentContext['componentModel'],
  properties: Record<string, unknown>,
): void {
  model.properties = properties;
}

/** Apply presets and explicitly clear removed optional keys in the kernel model. */
function useCompleteProperties(
  model: ComponentContext['componentModel'] | undefined,
  presets: Record<string, string> | undefined,
): void {
  const previous = useRef<{
    model: NonNullable<typeof model>;
    properties: Record<string, unknown>;
  }>(undefined);
  const current = model?.properties;
  useLayoutEffect(() => {
    if (!model || !current) return;
    const missing = Object.entries(presets ?? {}).filter(([key]) => !(key in current));
    const removed =
      previous.current?.model === model
        ? Object.keys(previous.current.properties).filter((key) => !(key in current))
        : [];
    if (missing.length || removed.length) {
      // Upstream binders merge their old snapshot. Explicit undefined replaces a
      // removed optional value while preserving node/binder identity and all
      // shared data. This only adjusts the renderer model; source wire stays intact.
      replaceModelProperties(model, {
        ...Object.fromEntries(removed.map((key) => [key, undefined])),
        ...Object.fromEntries(missing),
        ...current,
      });
    }
    previous.current = { model, properties: { ...model.properties } };
  }, [model, current, presets]);
}

/** Apply catalog presets and capture addresses while keeping native node views. */
export function wrapKernelComponentWithPresets<T extends ComponentApi>(
  kernelComponent: T,
  catalogComponentName: string,
  presets: Record<string, string> | undefined,
): T {
  const original = kernelComponent as unknown as ReactComponentImplementation;
  const attributes = (id: string) => ({
    'data-a2ui-component-id': id,
    'data-a2ui-capture-wrapper': '',
    style: { display: 'contents' },
  });
  const wrapped: ReactComponentImplementation = {
    name: catalogComponentName,
    schema: original.schema,
    view: original.view
      ? function CapturableNodeView(rendererProps) {
          // A stable node can receive fresh bound props without its parent
          // rerendering. Observe the same signal as the native child view.
          useSignalValue(rendererProps.node.props);
          const surface = useContext(KernelSurfaceContext);
          useCompleteProperties(
            surface?.componentsModel.get(rendererProps.node.componentId),
            presets,
          );
          const View = original.view!;
          return createElement(
            'div',
            attributes(rendererProps.node.componentId),
            createElement(View, rendererProps),
          );
        }
      : undefined,
    render: function CapturableLegacyView(rendererProps) {
      const model = rendererProps.context.componentModel;
      useCompleteProperties(model, presets);
      const content = original.render(rendererProps);
      if (content instanceof Promise)
        return content.then((resolved) => createElement('div', attributes(model.id), resolved));
      return createElement('div', attributes(model.id), content);
    },
  };
  return wrapped as unknown as T;
}
