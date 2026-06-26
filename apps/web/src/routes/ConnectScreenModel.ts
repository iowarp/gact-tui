/**
 * Pure connect-screen helpers: backend URL normalisation, the capabilities
 * endpoint, bearer auth headers, and the local-vs-remote host check.
 */
export const DEFAULT_CONNECT_URL = 'http://127.0.0.1:17800';

export function normalizedBackendBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function capabilitiesEndpoint(url: string): string {
  return `${normalizedBackendBaseUrl(url)}/v1/capabilities`;
}

export function bearerAuthHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isRemoteBackendUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return !(
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]'
  );
}

export function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

export function shouldRequestRemoteReauth(status: number, url: string): boolean {
  return isAuthFailure(status) && isRemoteBackendUrl(url);
}

export interface ConnectFailureState {
  error: string;
  reauthNeeded: boolean;
  revealAdvanced: boolean;
}

export function connectFailureStateForStatus(
  status: number,
  url: string,
): ConnectFailureState {
  return {
    error: `HTTP ${status}`,
    reauthNeeded: shouldRequestRemoteReauth(status, url),
    revealAdvanced: isAuthFailure(status),
  };
}

export function connectErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function connectErrorHint(message: string | null, brandName: string): string | null {
  if (!message) return null;
  if (/401|403/.test(message)) {
    return 'The backend rejected the credentials — paste a token issued by your backend.';
  }
  if (/404/.test(message)) return 'That URL responded but is not a GACT backend — check the port.';
  if (/HTTP \d/.test(message)) {
    return 'The backend answered with an error — check its logs, then press Connect to retry.';
  }
  return `Nothing answered at that URL — is the local backend running? Start ${brandName}'s backend, then press Connect to retry.`;
}
