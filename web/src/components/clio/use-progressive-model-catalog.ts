import { startTransition, useEffect, useMemo, useState } from 'react';
import type { ProviderGroup } from './model-picker-model';
import { cachedModelFacts, modelsPrepared } from './model-picker-fact-cache';

/** Paint providers first, prepare the selection next, then warm remaining lists. */
export function useProgressiveModelCatalog(providers: readonly ProviderGroup[], selected?: string) {
  const small = providers.reduce((sum, provider) => sum + provider.choices.length, 0) < 200;
  const [ready, setReady] = useState(
    () =>
      new Set(
        providers
          .filter((provider) => small || modelsPrepared(provider.choices))
          .map((provider) => provider.id),
      ),
  );
  useEffect(() => {
    let cancelled = false;
    let scheduled = 0;
    let secondFrame = 0;
    const queue = [...providers].sort(
      (a, b) => Number(b.id === selected) - Number(a.id === selected),
    );
    const next = () => {
      if (cancelled) return;
      const provider = queue.shift();
      if (!provider) return;
      provider.choices.forEach(cachedModelFacts);
      startTransition(() => setReady((current) => new Set(current).add(provider.id)));
      scheduled = requestAnimationFrame(next);
    };
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(next);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      cancelAnimationFrame(scheduled);
    };
  }, [providers, selected]);
  return useMemo(
    () =>
      new Set(
        providers
          .filter(
            (provider) => small || (ready.has(provider.id) && modelsPrepared(provider.choices)),
          )
          .map((provider) => provider.id),
      ),
    [providers, ready, small],
  );
}
