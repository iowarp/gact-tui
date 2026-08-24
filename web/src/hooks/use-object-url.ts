import { useEffect, useState } from 'react';

/** Owns a browser object URL without leaving Strict Mode previews pointed at a revoked blob. */
export function useObjectUrl(bytes: Uint8Array | undefined, mediaType: string): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!bytes) return;
    const nextUrl = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], {
        type: mediaType,
      }),
    );
    // The URL is an external browser resource created by this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [bytes, mediaType]);

  return bytes ? url : undefined;
}
