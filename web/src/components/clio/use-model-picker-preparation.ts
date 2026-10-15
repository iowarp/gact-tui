import { startTransition, useCallback, useEffect, useState } from 'react';
import type { ClioModelOption } from '@/lib/model-options';

const LARGE_CATALOG_SIZE = 200;

/** Give the dialog a paint before mounting a large catalog's tree and facets. */
export function useModelPickerPreparation(
  open: boolean,
  options: readonly ClioModelOption[],
  catalogStatus: 'error' | 'loading' | 'ready',
): {
  preparing: boolean;
  catalogOptions: readonly ClioModelOption[] | undefined;
  resetPreparation: () => void;
} {
  const [prepared, setPrepared] = useState<readonly ClioModelOption[]>();
  const large = options.length >= LARGE_CATALOG_SIZE;

  useEffect(() => {
    if (!open || catalogStatus !== 'ready') return;
    let cancelled = false;
    let secondFrame: number | undefined;
    // A single animation frame runs BEFORE paint. The second lets the shell
    // and its skeleton actually appear before synchronous catalog preparation.
    const firstFrame = requestAnimationFrame(() => {
      if (!large) {
        setPrepared(options);
        return;
      }
      secondFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        startTransition(() => setPrepared(options));
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [open, large, options, catalogStatus]);

  const resetPreparation = useCallback(() => setPrepared(undefined), []);
  return {
    preparing: large && prepared !== options,
    // Retain the mounted catalog's search/path during a refresh. Its new data
    // is handed over only after the loading shell has had a chance to paint.
    catalogOptions: !large && catalogStatus === 'ready' ? options : prepared,
    resetPreparation,
  };
}
