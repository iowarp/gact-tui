import { toast } from 'sonner';
import { inTauri } from '@/lib/transport/tauri-runtime';

/** Open a trusted external URL in the operating system's default browser. */
export async function openExternalUrl(url: string): Promise<void> {
  if (inTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('The browser blocked the sign-in page. Use the link again.');
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
