import { lazy, useState, type ComponentType } from 'react';

const idlePrefetch = new Set<() => Promise<unknown>>();

/**
 * Load a module that the first screen does not need, once. A failed load is
 * forgotten so the next attempt retries.
 */
export function deferredModule<Module>(load: () => Promise<Module>): {
  load: () => Promise<Module>;
  loaded: () => Module | undefined;
} {
  let pending: Promise<Module> | undefined;
  let value: Module | undefined;
  const run = () => {
    pending ??= load().then(
      (module) => {
        value = module;
        return module;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
  idlePrefetch.add(run);
  return { load: run, loaded: () => value };
}

/**
 * A component kept out of the initial bundle and warmed while the app is idle.
 * Once its module has loaded it renders synchronously: `lazy` alone suspends
 * on every first mount, and React then holds the fallback for its 300 ms
 * throttle. The component is chosen once per mount so it never remounts.
 */
export function deferredComponent<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
): ComponentType<Props> {
  const chunk = deferredModule(load);
  const Lazy = lazy(() => chunk.load().then((component) => ({ default: component })));
  return function DeferredComponent(props: Props) {
    const [Component] = useState<ComponentType<Props>>(() => chunk.loaded() ?? Lazy);
    return <Component {...props} />;
  };
}

/** Warm every deferred module; called from the app's idle route prefetch. */
export function prefetchDeferredChunks(): void {
  for (const load of idlePrefetch) void load().catch(() => undefined);
}
