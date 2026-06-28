import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONNECT_URL,
  bearerAuthHeaders,
  connectErrorMessage,
  capabilitiesEndpoint,
  connectFailureStateForStatus,
  connectErrorHint,
  isAuthFailure,
  isRemoteBackendUrl,
  normalizedBackendBaseUrl,
  shouldRequestRemoteReauth,
} from '../../src/routes/ConnectScreenModel.js';

describe('ConnectScreenModel', () => {
  it('builds stable connection request pieces', () => {
    expect(DEFAULT_CONNECT_URL).toBe('http://127.0.0.1:17800');
    expect(normalizedBackendBaseUrl('http://127.0.0.1:17800///')).toBe(
      'http://127.0.0.1:17800',
    );
    expect(capabilitiesEndpoint('http://127.0.0.1:17800/')).toBe(
      'http://127.0.0.1:17800/v1/capabilities',
    );
    expect(bearerAuthHeaders('')).toEqual({});
    expect(bearerAuthHeaders('secret-token')).toEqual({
      Authorization: 'Bearer secret-token',
    });
  });

  it('distinguishes local backend URLs from remote backend URLs', () => {
    expect(isRemoteBackendUrl('http://127.0.0.1:17800')).toBe(false);
    expect(isRemoteBackendUrl('http://localhost:17800')).toBe(false);
    expect(isRemoteBackendUrl('http://[::1]:17800')).toBe(false);
    expect(isRemoteBackendUrl('https://clio-staging.example.com')).toBe(true);
    expect(isRemoteBackendUrl('not a url')).toBe(false);
  });

  it('requests reauth only for remote auth failures', () => {
    expect(isAuthFailure(401)).toBe(true);
    expect(isAuthFailure(403)).toBe(true);
    expect(isAuthFailure(500)).toBe(false);
    expect(shouldRequestRemoteReauth(401, 'https://clio-staging.example.com')).toBe(true);
    expect(shouldRequestRemoteReauth(403, 'https://clio-staging.example.com')).toBe(true);
    expect(shouldRequestRemoteReauth(401, 'http://127.0.0.1:17800')).toBe(false);
    expect(shouldRequestRemoteReauth(500, 'https://clio-staging.example.com')).toBe(false);
  });

  it('maps failed HTTP responses to UI state decisions', () => {
    expect(
      connectFailureStateForStatus(401, 'https://clio-staging.example.com'),
    ).toEqual({
      error: 'HTTP 401',
      reauthNeeded: true,
      revealAdvanced: true,
    });
    expect(connectFailureStateForStatus(401, 'http://127.0.0.1:17800')).toEqual(
      {
        error: 'HTTP 401',
        reauthNeeded: false,
        revealAdvanced: true,
      },
    );
    expect(
      connectFailureStateForStatus(500, 'https://clio-staging.example.com'),
    ).toEqual({
      error: 'HTTP 500',
      reauthNeeded: false,
      revealAdvanced: false,
    });
  });

  it('normalizes thrown connection errors to display text', () => {
    expect(connectErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(connectErrorMessage('plain failure')).toBe('plain failure');
  });

  it('maps connection failures to actionable hints', () => {
    expect(connectErrorHint(null, 'GACT')).toBeNull();
    expect(connectErrorHint('HTTP 401', 'GACT')).toContain('credentials');
    expect(connectErrorHint('HTTP 404', 'GACT')).toContain('not a GACT backend');
    expect(connectErrorHint('HTTP 500', 'GACT')).toContain('check its logs');
    expect(connectErrorHint('Failed to fetch', 'GACT')).toContain("Start GACT's backend");
  });
});
