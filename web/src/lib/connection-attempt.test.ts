import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { vocab } from './brand-vocabulary';
import type { KnownConnection } from '@/hooks/use-known-connections';
import { ServiceTimeoutError, unavailableFromError } from '@/hooks/use-connection-availability';
import {
  connectRetryDelayMs,
  knownServiceFailure,
  serviceStillStarting,
  type ConnectAttempt,
} from './connection-attempt';
import { ServiceVersionError } from './service-version-error';

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

describe('a service on another interface version', () => {
  it('names the side to update and keeps version numbers in the details', () => {
    const older = new ServiceVersionError('0.3', ['0.2']);
    expect(older.message).toBe(
      `This ${vocab.agent} is older than this app. Update ${vocab.agent} to open it here.`,
    );
    expect(older.message).not.toMatch(/protocol|0\.[23]/iu);
    expect(older.details).toEqual({ required: '0.3', offered: ['0.2'] });
    expect(new ServiceVersionError('0.3', ['0.4']).message).toMatch(/Update this app/u);
    expect(new ServiceVersionError('0.3', ['0.2', '0.4']).message).toMatch(/same release/u);
    expect(new ServiceVersionError('0.3', []).message).toMatch(/not a .+ this app can open/u);
  });
});
describe('a failed service row', () => {
  const idle: ConnectAttempt = {
    isError: false,
    isPending: false,
    error: null,
    submittedAt: 0,
    mutate: () => {},
  };
  const row = (error: unknown, label?: string) => {
    const connection = { endpoint: 'http://127.0.0.1:9', label } as KnownConnection;
    return knownServiceFailure(connection, unavailableFromError(error), idle);
  };

  it('says "no answer" only when nothing answered, and then names the address', () => {
    const down = new TransportError('down', undefined, 'network_unavailable');
    expect(row(down)).toBe("Can't connect: no answer from 127.0.0.1:9");
    expect(row(down, 'Lab')).toBe("Can't connect: no answer from 127.0.0.1:9");
  });

  it.each([
    ['a probe that timed out', new ServiceTimeoutError(), "Can't connect: no response in time"],
    [
      'a service that answered with a 502',
      new TransportError('bad gateway', 502, 'upstream'),
      "Can't connect: the service reported an error",
    ],
    [
      'a service on another version',
      new ServiceVersionError('0.3', ['0.2']),
      "Can't connect: incompatible version",
    ],
    [
      'an incompatible capabilities response',
      new TransportError('X-GACT-Version 0.3', undefined, 'incompatible_capabilities'),
      "Can't connect: incompatible version",
    ],
    ['a local failure', new Error('Connection refused'), "Can't connect: Connection refused"],
    [
      'an unexpected exception',
      new TypeError("Cannot read properties of undefined (reading 'invoke')"),
      "Can't connect: unexpected error",
    ],
  ])('reports %s as what happened', (_name, error, line) => {
    expect(row(error)).toBe(line);
    expect(row(error)).not.toMatch(/no answer|protocol|0\.\d/iu);
  });
});

it('keeps an unexpected exception for technical details, never as the reason', () => {
  const availability = unavailableFromError(new TypeError('Cannot read properties of undefined'));
  expect(availability.detail).toBe('unexpected error');
  expect(availability.diagnostics).toBe('TypeError: Cannot read properties of undefined');
});
