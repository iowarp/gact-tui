import { useCallback, useSyncExternalStore } from 'react';

/** The part of an A2UI data context a view needs to read and write one bound path. */
export interface BoundDataContext {
  resolveDynamicValue: (value: never) => unknown;
  subscribeDynamicValue: (
    value: never,
    onChange: (value: unknown) => void,
  ) => { unsubscribe: () => void };
  set: (path: string, value: unknown) => void;
}

/** The path of a `{path}` binding, else undefined. */
export function boundPath(binding: unknown): string | undefined {
  if (typeof binding !== 'object' || binding === null || Array.isArray(binding)) return undefined;
  const path = (binding as { path?: unknown }).path;
  return typeof path === 'string' && path.startsWith('/') ? path : undefined;
}

/**
 * The live value at a bound data-model path and a writer for it. Used for
 * bindings nested inside a component's properties (a draw target, edits, an
 * exclusion list), which the generic binder does not give a setter.
 */
export function useBoundValue(
  dataContext: BoundDataContext,
  binding: unknown,
): [unknown, ((value: unknown) => void) | undefined] {
  const path = boundPath(binding);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!path) return () => undefined;
      const subscription = dataContext.subscribeDynamicValue({ path } as never, onChange);
      return () => subscription.unsubscribe();
    },
    [dataContext, path],
  );
  const read = useCallback(
    () => (path ? dataContext.resolveDynamicValue({ path } as never) : undefined),
    [dataContext, path],
  );
  const value = useSyncExternalStore(subscribe, read, read);
  const write = useCallback(
    (next: unknown) => {
      if (path) dataContext.set(path, next);
    },
    [dataContext, path],
  );
  return [value, path ? write : undefined];
}
