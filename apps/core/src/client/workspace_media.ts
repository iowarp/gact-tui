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

export function normalizeWorkspaceMediaType(path: string, declared: string): string {
  const fallback = declared || 'application/octet-stream';
  const lower = fallback.toLowerCase();
  const ext = path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? '';
  const inferred = WORKSPACE_MEDIA_BY_EXT[ext];
  if (!inferred) return fallback;
  if (
    lower === 'application/octet-stream' ||
    lower === 'binary/octet-stream' ||
    lower === 'text/plain'
  ) {
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
