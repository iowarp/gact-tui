/**
 * Best-effort host OS sniff for desktop-only cosmetic layout decisions —
 * showing the custom window-control buttons and padding the title bar's
 * left edge clear of the native macOS traffic lights. Never used for
 * anything security- or correctness-relevant: unlike a routing or
 * permission decision, getting this wrong just misplaces a button.
 *
 * No new Tauri command/plugin is added for this: `navigator.platform` /
 * `navigator.userAgent` already reflect the real host OS inside a Tauri
 * WebView (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux all
 * report it faithfully), so a dedicated native round trip would be
 * unnecessary surface for a purely cosmetic signal.
 */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform ?? '';
  const agent = navigator.userAgent ?? '';
  return /Mac/u.test(platform) || /Macintosh/u.test(agent);
}
