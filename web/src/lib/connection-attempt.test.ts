import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { connectRetryDelayMs, serviceStillStarting } from './connection-attempt';

describe('connect retry backoff (#739 B1)', () => {
  it('starts at 250 ms and doubles to a 2 s ceiling', () => {
    expect([0, 1, 2, 3, 4, 8].map((retry) => connectRetryDelayMs(retry))).toEqual([
      250, 500, 1000, 2000, 2000, 2000,
    ]);
  });

  it("never retries sooner than the service's Retry-After", () => {
    expect([0, 1, 2, 3].map((retry) => connectRetryDelayMs(retry, 1000))).toEqual([
      1000, 1000, 1000, 2000,
    ]);
    expect(connectRetryDelayMs(3, 5000)).toBe(5000);
  });
});

describe('a service still starting', () => {
  it.each([
    ['a 503 task_runtime_starting', new TransportError('starting', 503, 'task_runtime_starting')],
    [
      'readiness reported as starting',
      new TransportError('starting', 503, 'task_runtime_starting', { readiness: 'starting' }),
    ],
    ['a bare 503', new TransportError('unavailable', 503)],
  ])('is %s', (_name, error) => expect(serviceStillStarting(error)).toBe(true));

  it.each([
    [
      'a task runtime that failed to start',
      new TransportError('failed', 503, 'task_runtime_unavailable', { readiness: 'failed' }),
    ],
    ['an unknown route', new TransportError('missing', 404, 'not_found')],
    ['an unreachable service', new TransportError('down', undefined, 'network_unavailable')],
    ['a non-transport failure', new Error('incompatible')],
    ['no error', undefined],
  ])('is not %s', (_name, error) => expect(serviceStillStarting(error)).toBe(false));
});
