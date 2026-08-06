const WORKSPACE_MEDIA_BY_EXT: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  go: 'text/x-go',
  py: 'text/x-python',
  rs: 'text/x-rust',
  ts: 'text/typescript',
  tsx: 'text/tsx',
  js: 'text/javascript',
  jsx: 'text/jsx',
  css: 'text/css',
  html: 'text/html',
};

/**
 * Declared content-types that are too vague/unreliable to trust over the
 * path extension. `application/vnd.ms-excel` is Windows' own guess for
 * `.csv` — Python's `mimetypes.guess_type` falls back to the Windows
 * registry there, which maps the CSV extension to Excel's legacy MIME type
 * (live-probed against the gact server's `/v1/workspaces/{wid}/files/read`
 * on Windows: a real `.csv` read comes back `Content-Type:
 * application/vnd.ms-excel`, not `text/csv`). Left unnormalized, a CSV read
 * on Windows carries a media type that fails every text/* classification a
 * caller does on it — the file view then renders a real CSV as a binary
 * notice, contradicting the "text/csv previews as text" contract.
 */
const GENERIC_DECLARED_MEDIA_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'text/plain',
  'application/vnd.ms-excel',
]);

export function normalizeWorkspaceMediaType(path: string, declared: string): string {
  const fallback = declared || 'application/octet-stream';
  const lower = fallback.toLowerCase();
  const ext = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
  const inferred = WORKSPACE_MEDIA_BY_EXT[ext];
  if (!inferred) return fallback;
  if (GENERIC_DECLARED_MEDIA_TYPES.has(lower)) {
    return inferred;
  }
  return fallback;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
}
