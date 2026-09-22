import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, TransportRequest } from './transport.js';

class RecordingTransport implements ClioTransport {
  public requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return Promise.resolve(request.decode(this.responses.shift()));
  }

  public stream(): never {
    throw new Error('unused');
  }
}

describe('infrastructure repository', () => {
  it('keeps target and service actions on the connected CLIO API', async () => {
    const transport = new RecordingTransport([
      {
        targets: [
          {
            id: 'local',
            label: "This CLIO's computer",
            kind: 'local',
            transport_state: 'connected',
            created_at: '2026-09-21T00:00:00Z',
            updated_at: '2026-09-21T00:00:00Z',
          },
        ],
      },
      {
        id: 'operation-1',
        service_id: 'web_search',
        target_id: 'local',
        action: 'start',
        state: 'queued',
        progress: 'Queued',
        logs: '',
        created_at: '2026-09-21T00:00:00Z',
        updated_at: '2026-09-21T00:00:00Z',
      },
    ]);
    const repository = new ClioRepository(transport);

    const targets = await repository.infrastructureTargets();
    const operation = await repository.runManagedServiceAction('web_search', {
      target_id: 'local',
      action: 'start',
      variant_id: 'container',
      configuration: {},
    });

    expect(targets[0]?.id).toBe('local');
    expect(operation.id).toBe('operation-1');
    expect(transport.requests.map((request) => request.path)).toEqual([
      '/v1/infrastructure/targets',
      '/v1/infrastructure/services/web_search/actions',
    ]);
  });

  it('edits targets and manages connection-only services without desktop drivers', async () => {
    const target = {
      id: 'homelab',
      label: 'Homelab',
      kind: 'ssh',
      install_root: '/srv/clio',
      ssh: {
        profile: 'homelab',
        host: '10.0.0.102',
        user: 'alice',
        port: 22,
        jump_hosts: [],
        identity_file: '',
        platform: 'linux' as const,
      },
      transport_state: 'state_unknown',
      auto_reconnect: true,
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
    };
    const connection = {
      id: 'external-1',
      service_id: 'web_search',
      label: 'NSF search',
      url: 'https://search.example.edu',
      credential_ref: 'nsf',
      managed: false,
      reachable: true,
      checked_at: '2026-09-21T00:00:00Z',
      created_at: '2026-09-21T00:00:00Z',
    };
    const transport = new RecordingTransport([
      target,
      connection,
      connection,
      connection,
      undefined,
    ]);
    const repository = new ClioRepository(transport);

    await repository.updateInfrastructureTarget('homelab', {
      label: 'Homelab',
      kind: 'ssh',
      install_root: '/srv/clio',
      ssh: target.ssh,
    });
    await repository.createExternalServiceConnection({
      service_id: 'web_search',
      label: 'NSF search',
      url: 'https://search.example.edu',
      credential_ref: 'nsf',
    });
    await repository.checkExternalServiceConnection('external-1');
    await repository.updateExternalServiceConnection('external-1', {
      service_id: 'web_search',
      label: 'NSF search',
      url: 'https://search.example.edu',
      credential_ref: 'nsf',
    });
    await repository.deleteExternalServiceConnection('external-1');

    expect(transport.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'PUT /v1/infrastructure/targets/homelab',
      'POST /v1/infrastructure/service-connections',
      'POST /v1/infrastructure/service-connections/external-1/check',
      'PUT /v1/infrastructure/service-connections/external-1',
      'DELETE /v1/infrastructure/service-connections/external-1',
    ]);
  });
});
