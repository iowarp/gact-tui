import type { McpUserConfiguration } from '@clio/core/v3';

/** Read the explicit remote service address from a persisted Web Search spec. */
export function remoteUrlFromSpec(spec: Record<string, unknown> | undefined): string | undefined {
  const args = spec?.args;
  if (!Array.isArray(args)) return undefined;
  const remoteFlag = args.findIndex((value) => value === '--remote-url');
  const remoteUrl = remoteFlag >= 0 ? args[remoteFlag + 1] : undefined;
  return typeof remoteUrl === 'string' && remoteUrl.trim() ? remoteUrl.trim() : undefined;
}

function normalizedServiceUrl(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return trimmed.replace(/\/+$/u, '');
  }
}

/** Return true only when the saved MCP address is the selected deployment. */
export function webSearchConnectionMatchesTarget(
  ready: boolean,
  connection: McpUserConfiguration | undefined,
  targetUrl?: string | null,
): boolean {
  const configuredUrl = remoteUrlFromSpec(connection?.spec);
  return (
    ready &&
    normalizedServiceUrl(configuredUrl) !== undefined &&
    normalizedServiceUrl(configuredUrl) === normalizedServiceUrl(targetUrl)
  );
}
