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
