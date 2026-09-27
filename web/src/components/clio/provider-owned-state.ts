import { useCallback, useState } from 'react';

/**
 * State that belongs to ONE provider (and transport scope) of a shared action
 * hook. The picker keeps one `useProviderActions` instance and changes its
 * provider as the person moves between rows, so an action that settles after
 * the move -- a "Reload models" whose failure lands two seconds later -- used
 * to write its result, stage or error into the NEXT provider's panel.
 *
 * Every value is stored under the owner that was current when its setter was
 * created. A running action holds the setter from the render that started it,
 * so it can only ever write to its own provider; a read returns the current
 * owner's value and nothing else.
 */
export function useOwnedState<T>(owner: string): [T | undefined, (next: T | undefined) => void, () => void] {
  const [slots, setSlots] = useState<ReadonlyMap<string, T>>(() => new Map());
  const set = useCallback(
    (next: T | undefined) =>
      setSlots((current) => {
        if (next === undefined && !current.has(owner)) return current;
        const updated = new Map(current);
        if (next === undefined) updated.delete(owner);
        else updated.set(owner, next);
        return updated;
      }),
    [owner],
  );
  const clear = useCallback(() => setSlots((current) => (current.size ? new Map() : current)), []);
  return [slots.get(owner), set, clear];
}

/** The owner key for a provider and one of its transport scopes. */
export function providerOwner(presetId: string, scope: string): string {
  return `${presetId}\u0000${scope}`;
}
