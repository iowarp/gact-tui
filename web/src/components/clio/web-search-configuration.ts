/** Read the explicit remote service address from a persisted Web Search spec. */
export function remoteUrlFromSpec(spec: Record<string, unknown> | undefined): string | undefined {
  const args = spec?.args;
  if (!Array.isArray(args)) return undefined;
  const remoteFlag = args.findIndex((value) => value === '--remote-url');
  const remoteUrl = remoteFlag >= 0 ? args[remoteFlag + 1] : undefined;
  return typeof remoteUrl === 'string' && remoteUrl.trim() ? remoteUrl.trim() : undefined;
}
