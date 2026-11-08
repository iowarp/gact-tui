import { type ComponentType, lazy, type LazyExoticComponent } from 'react';

type Module<T> = { default: T };

/**
 * React.lazy plus `preload()`. Once the chunk has loaded, the component's
 * first render does not suspend: lazy receives an already-settled thenable,
 * so no fallback commits before the real content.
 */
export function lazyWithPreload<P extends object, T extends ComponentType<P> = ComponentType<P>>(
  load: () => Promise<Module<T>>,
): LazyExoticComponent<T> & { preload: () => Promise<Module<T>> } {
  let loaded: Module<T> | undefined;
  let pending: Promise<Module<T>> | undefined;
  const preload = () => {
    pending ??= load().then(
      (module) => {
        loaded = module;
        return module;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
  const component = lazy(() =>
    loaded
      ? // React reads a thenable that settles synchronously as already resolved.
        ({ then: (resolve: (module: Module<T>) => void) => resolve(loaded as Module<T>) } as never)
      : preload(),
  );
  return Object.assign(component, { preload });
}

/** Runs `task` once the browser is idle (or after `timeout` ms); returns a cancel function. */
export function whenIdle(task: () => void, timeout = 4000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, Math.min(timeout, 1500));
  return () => window.clearTimeout(id);
}
