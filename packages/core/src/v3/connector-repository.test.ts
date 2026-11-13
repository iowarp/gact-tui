import { describe, expect, it } from 'vitest';
import { connectorSchema, connectorSetupPayload, missingNeeds } from './connector-domain.js';
import { pluginEntrySchema } from './plugin-domain.js';
import { pendingInteractionOrDegradedSchema } from './pending-interaction-schemas.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';
import { ClioRepository } from './repository.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return request.decode(this.responses.shift());
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

const fixture = {
  id: 'fixture-address',
  name: 'Fixture with an address',
  description: 'Needs an address and a sign-in',
  logo_url: null,
  source: 'catalog',
  enabled: true,
  plugin_ref: 'clio-connectors/connector-fixture-address',
  plugin: null,
  tool_count: null,
  state: { status: 'needs', needs: ['address', 'account'], reason: null },
  needs: [
    {
      key: 'address',
      kind: 'address',
      label: 'Server address',
      help: 'Where the server listens',
      required: true,
      agent_settable: true,
      default: null,
      value: null,
      has_value: false,
    },
    {
      key: 'account',
      kind: 'sign-in',
      label: 'Account',
      help: null,
      required: true,
      agent_settable: false,
      default: null,
      value: null,
      has_value: false,
    },
    {
      key: 'token',
      kind: 'secret',
      label: 'Token',
      required: false,
      agent_settable: false,
      // A server that sent a secret back must never have it held by the client.
      value: 'leaked',
      has_value: true,
    },
  ],
};

describe('connector repository', () => {
  it('lists, reads a logo, saves values, enables, disables and creates through /v1/connectors', async () => {
    const ready = { ...fixture, state: { status: 'ready', needs: [], reason: null } };
    const transport = new RecordingTransport([
      { connectors: [fixture] },
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ready,
      ready,
      { ...ready, enabled: false },
      { ...ready, id: 'custom-1', source: 'custom' },
    ]);
    const repository = new ClioRepository(transport);

    const [listed] = await repository.connectors();
    expect(listed?.state.status).toBe('needs');
    expect(listed?.needs[2]?.value).toBeNull();
    expect(listed?.needs[2]?.has_value).toBe(true);
    expect(listed?.needs[1]?.help).toBe('');
    expect(await repository.connectorLogo('fixture-address')).toContain('<svg');
    const saved = await repository.setConnectorValues('fixture-address', {
      address: 'http://127.0.0.1:19201/mcp',
      token: null,
    });
    expect(saved.state.status).toBe('ready');
    await repository.enableConnector('fixture-address');
    const disabled = await repository.disableConnector('fixture-address');
    expect(disabled.enabled).toBe(false);
    const created = await repository.createConnector({ url: 'http://127.0.0.1:19202/mcp' });
    expect(created.source).toBe('custom');

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/v1/connectors' },
      { method: 'GET', path: '/v1/connectors/fixture-address/logo' },
      { method: 'PUT', path: '/v1/connectors/fixture-address/values' },
      { method: 'POST', path: '/v1/connectors/fixture-address/enable' },
      { method: 'POST', path: '/v1/connectors/fixture-address/disable' },
      { method: 'POST', path: '/v1/connectors' },
    ]);
    expect(transport.requests[1]?.responseType).toBe('text');
    expect(transport.requests[2]?.body).toEqual({
      values: { address: 'http://127.0.0.1:19201/mcp', token: null },
    });
    expect(transport.requests[3]?.body).toBeUndefined();
  });

  it('names the missing needs in the entry order and reads an unknown kind or status', () => {
    const connector = connectorSchema.parse({
      ...fixture,
      state: { status: 'paused', needs: ['account', 'address'] },
      needs: [...fixture.needs, { key: 'x', kind: 'biometric', has_value: false }],
    });
    expect(connector.state.status).toBe('unknown');
    expect(connector.needs[3]?.kind).toBe('unknown');
    expect(missingNeeds(connector).map((need) => need.key)).toEqual(['address', 'account']);
  });

  it('reads a connector_setup interaction and its payload', () => {
    const interaction = pendingInteractionOrDegradedSchema.parse({
      id: 'int-1',
      kind: 'connector_setup',
      owner_session_id: 'sess-1',
      attended_session_id: 'sess-1',
      status: 'pending',
      title: 'Set up Fixture with an address',
      source: { protocol: 'native', tool_name: 'fixture-address__echo' },
      created_at: '2026-11-13T00:00:00Z',
      payload: {
        connector_id: 'fixture-address',
        tool_name: 'fixture-address__echo',
        missing: [fixture.needs[2]],
      },
      actions: ['submit', 'decline'],
    });
    expect(interaction.kind).toBe('connector_setup');
    const payload = connectorSetupPayload(
      'payload' in interaction ? interaction.payload : undefined,
    );
    expect(payload?.connector_id).toBe('fixture-address');
    expect(payload?.missing[0]?.value).toBeNull();
    expect(connectorSetupPayload({ question_id: 'q' })).toBeUndefined();
  });

  it('reads the connector a plugin follows', () => {
    const base = { id: 'scenes', ref: 'clio/scenes' };
    expect(pluginEntrySchema.parse({ ...base, follows: 'fixture-secret' }).follows).toBe(
      'fixture-secret',
    );
    expect(pluginEntrySchema.parse(base).follows).toBe('');
    expect(pluginEntrySchema.parse({ ...base, follows: null }).follows).toBe('');
  });
});
