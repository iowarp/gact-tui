import { useEffect, useRef } from 'react';

/** Open a flow run deep link (`?flow=<task handle>`) once for the current route. */
export function useRequestedFlow(
  handle: string | null,
  openFlow: (handle: string, label?: string) => void,
) {
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!handle || opened.current === handle) return;
    opened.current = handle;
    openFlow(handle);
  }, [handle, openFlow]);
}
