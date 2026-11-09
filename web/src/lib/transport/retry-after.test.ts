import { expect, it } from 'vitest';
import { headerValue, retryAfterMs } from './retry-after';

it('reads Retry-After delay seconds', () => {
  expect(retryAfterMs('1')).toBe(1000);
  expect(retryAfterMs(' 0.5 ')).toBe(500);
});

it('reads a Retry-After HTTP date relative to now, never negative', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  expect(retryAfterMs('Fri, 20 Nov 2026 10:00:03 GMT', undefined, now)).toBe(3000);
  expect(retryAfterMs('Fri, 20 Nov 2026 09:59:00 GMT', undefined, now)).toBe(0);
});

it('falls back to the envelope retry_after_s, else names no wait', () => {
  expect(retryAfterMs(null, 1)).toBe(1000);
  expect(retryAfterMs('soon', 2)).toBe(2000);
  expect(retryAfterMs(undefined, 'one')).toBeUndefined();
  expect(retryAfterMs(undefined, -1)).toBeUndefined();
});

it('matches a header name case-insensitively', () => {
  expect(headerValue({ 'retry-after': '1' }, 'Retry-After')).toBe('1');
  expect(headerValue({ 'content-type': 'x' }, 'Retry-After')).toBeUndefined();
  expect(headerValue(undefined, 'Retry-After')).toBeUndefined();
});
