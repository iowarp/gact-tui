import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  A2UI_REGISTRY_MAX_RETRIES,
  classifyA2uiRegistryFailure,
  isA2uiRegistryFailureRetryable,
  shouldRetryA2uiRegistryFailure,
} from './registry-failure';

describe('classifyA2uiRegistryFailure', () => {
  it('classifies a 404 TransportError as route_unavailable', () => {
    const failure = classifyA2uiRegistryFailure(new TransportError('Not Found', 404));
    expect(failure).toMatchObject({
      reason: 'route_unavailable',
      code: 'a2ui_catalog_route_unavailable',
    });
    expect(failure.detail).toContain('does not support');
  });

  it('classifies a 501 TransportError as route_unavailable', () => {
    const failure = classifyA2uiRegistryFailure(new TransportError('Not Implemented', 501));
    expect(failure.reason).toBe('route_unavailable');
  });

  it('classifies a 500 TransportError as network_error, NOT route_unavailable', () => {
    // Only 404/501 mean "this server has no A2UI catalog routes at all" --
    // a transient 500 must never say that, and must remain retryable.
    const failure = classifyA2uiRegistryFailure(new TransportError('Internal Server Error', 500));
    expect(failure.reason).toBe('network_error');
    expect(failure.code).toBe('a2ui_catalog_network_error');
    expect(failure.detail).not.toContain('does not support');
  });

  it('classifies a status-less TransportError (a real fetch/network failure) as network_error', () => {
    const failure = classifyA2uiRegistryFailure(
      new TransportError('Unable to reach the service', undefined, 'network_unavailable'),
    );
    expect(failure.reason).toBe('network_error');
  });

  it('classifies a decode/parse error (the response arrived but did not decode) as decode_failed', () => {
    const failure = classifyA2uiRegistryFailure(
      new Error('expected the "catalogs" field to be an array'),
    );
    expect(failure.reason).toBe('decode_failed');
    expect(failure.code).toBe('a2ui_catalog_decode_failed');
    expect(failure.detail).toContain('expected the "catalogs" field to be an array');
  });

  it('classifies a non-Error thrown value as decode_failed with a generic detail', () => {
    const failure = classifyA2uiRegistryFailure('not an Error instance');
    expect(failure.reason).toBe('decode_failed');
  });
});

describe('isA2uiRegistryFailureRetryable', () => {
  it('is retryable only for network_error', () => {
    expect(isA2uiRegistryFailureRetryable('network_error')).toBe(true);
    expect(isA2uiRegistryFailureRetryable('route_unavailable')).toBe(false);
    expect(isA2uiRegistryFailureRetryable('decode_failed')).toBe(false);
  });
});

describe('shouldRetryA2uiRegistryFailure', () => {
  const networkError = new TransportError('offline', undefined, 'network_unavailable');
  const routeUnavailable = new TransportError('Not Found', 404);
  const decodeFailed = new Error('bad shape');

  it('retries a network_error up to A2UI_REGISTRY_MAX_RETRIES times, then stops', () => {
    for (let failureCount = 0; failureCount < A2UI_REGISTRY_MAX_RETRIES; failureCount += 1) {
      expect(shouldRetryA2uiRegistryFailure(failureCount, networkError)).toBe(true);
    }
    expect(shouldRetryA2uiRegistryFailure(A2UI_REGISTRY_MAX_RETRIES, networkError)).toBe(false);
  });

  it('never retries route_unavailable, even on the very first failure', () => {
    expect(shouldRetryA2uiRegistryFailure(0, routeUnavailable)).toBe(false);
  });

  it('never retries decode_failed, even on the very first failure', () => {
    expect(shouldRetryA2uiRegistryFailure(0, decodeFailed)).toBe(false);
  });
});
