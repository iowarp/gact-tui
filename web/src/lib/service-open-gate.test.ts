import { PROTOCOL_VERSION, TransportError } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { ServiceVersionError } from '@/lib/service-version-error';
import { assertServiceOpenable } from './service-open-gate';

function repository(health: unknown, versions: string[] = [PROTOCOL_VERSION]) {
  return {
    capabilities: vi.fn().mockResolvedValue({ gact_versions: versions }),
    serviceHealth: vi.fn(() =>
      health instanceof Error ? Promise.reject(health) : Promise.resolve(health),
    ),
  } as unknown as Parameters<typeof assertServiceOpenable>[0];
}

const endpoint = 'http://127.0.0.1:8788';

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('assertServiceOpenable', () => {
  it('opens a ready service, and one whose health cannot be read', async () => {
    await expect(
      assertServiceOpenable(repository({ readiness: 'ready' }), endpoint),
    ).resolves.toEqual({ gact_versions: [PROTOCOL_VERSION] });
    await expect(
      assertServiceOpenable(repository(new Error('no health route')), endpoint),
    ).resolves.toEqual({ gact_versions: [PROTOCOL_VERSION] });
  });

  it('refuses a service that does not speak this protocol', async () => {
    const error = await rejection(assertServiceOpenable(repository({}, ['0.0']), endpoint));
    expect(error).toBeInstanceOf(ServiceVersionError);
  });

  it('waits on a starting service', async () => {
    const error = await rejection(
      assertServiceOpenable(
        repository({ readiness: 'starting', starting: ['task_runtime'] }),
        endpoint,
      ),
    );
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({
      status: 503,
      code: 'task_runtime_starting',
      details: { readiness: 'starting', starting: ['task_runtime'] },
    });
  });

  it('stops at a failed start with the service message', async () => {
    const error = await rejection(
      assertServiceOpenable(
        repository({
          readiness: 'failed',
          failure: { reason: 'arc_store_format_old', message: 'Run clio reset-store.' },
        }),
        endpoint,
      ),
    );
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({
      message: 'Run clio reset-store.',
      status: 503,
      code: 'task_runtime_unavailable',
      details: { readiness: 'failed', reason: 'arc_store_format_old' },
    });
  });
});
