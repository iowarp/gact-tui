import { toast } from 'sonner';
import { inTauri } from '@/lib/transport/tauri-runtime';

/** Open a trusted external URL in the operating system's default browser. */
export async function openExternalUrl(url: string): Promise<void> {
  if (inTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }

  // With noopener, browsers can return null even when the tab opened successfully.
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Reserve a browser tab during a user click, before an async authorization request. */
export function prepareExternalUrl(): { open: (url: string) => Promise<void>; cancel: () => void } {
  const pending = inTauri() ? null : window.open('about:blank', '_blank');
  if (pending) pending.opener = null;
  return {
    open: async (url: string) => {
      if (pending && !pending.closed) pending.location.replace(url);
      else await openExternalUrl(url);
    },
    cancel: () => {
      if (pending && !pending.closed) pending.close();
    },
  };
}

/**
 * `openExternalUrl`, reporting a failed open with a toast instead of an
 * unhandled rejection. For call sites that trigger an open programmatically
 * — a native menu action, a card's `onOpen` callback — rather than from a
 * rendered `ExternalLink`, which handles this itself.
 */
export function openExternalUrlOrToast(url: string): void {
  openExternalUrl(url).catch((error: unknown) => {
    toast.error(error instanceof Error ? error.message : 'Could not open the link.');
  });
}
