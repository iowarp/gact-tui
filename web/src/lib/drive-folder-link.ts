/**
 * Reduce what people paste into the Google Drive folder field to what Drive accepts:
 * `root` for My Drive, or the folder ID. Anything unrecognized passes through trimmed
 * so the service can explain the problem.
 */
export function normalizeDriveFolder(value: string): string {
  const text = value.trim();
  if (/^root$/i.test(text)) return 'root';
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return text;
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'drive.google.com') return text;
  if (url.username || url.password || url.port) return text;
  const path = url.pathname.replace(/\/+$/, '');
  if (/^\/drive(?:\/u\/\d+)?\/my-drive$/i.test(path)) return 'root';
  const folder = /^(?:\/drive(?:\/u\/\d+)?)?\/folders\/([A-Za-z0-9_-]+)$/.exec(path);
  return folder ? folder[1] : text;
}
