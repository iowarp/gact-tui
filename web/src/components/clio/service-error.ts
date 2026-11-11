const RAW_HTTP = /^request failed with (\d{3})\b/iu;

/**
 * Why a list couldn't load, in plain words: the server's own sentence when it
 * gave one, never a bare transport status line.
 */
export function serviceErrorDetail(message?: string): string | undefined {
  const trimmed = message?.trim();
  if (!trimmed) return undefined;
  const status = RAW_HTTP.exec(trimmed)?.[1];
  if (!status) return trimmed;
  if (status === '404') return 'The service found nothing here. It may have moved.';
  if (status === '401' || status === '403') return 'The service denied access.';
  if (status.startsWith('5')) return 'The service failed and gave no reason.';
  return `The service refused the request (${status}).`;
}
