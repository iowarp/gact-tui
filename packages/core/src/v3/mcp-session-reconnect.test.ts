import { describe, expect, it, vi } from 'vitest';
import { McpRepository } from './mcp-repository.js';
import { mcpServerDefinitionSchema } from './schemas.js';

describe('MCP server preparation on the wire', () => {
  it('decodes a server row with its preparation and typed reason', () => {
    const row = mcpServerDefinitionSchema.parse({
      id: 'session_mcp_sess_1_spotter',
      name: 'spotter',
      status: 'failed',
      reason: 'mcp_prepare_provision_failed',
      preparation: {
        namespace: 'spotter',
        state: 'failed',
        phase: 'provision',
        reason: 'mcp_prepare_provision_failed',
        detail: 'uv sync exited 2',
        attempt: 1,
        elapsed_s: 0.79,
      },
    });
    expect(row.preparation?.state).toBe('failed');
    expect(row.preparation?.detail).toBe('uv sync exited 2');
    expect(row.reason).toBe('mcp_prepare_provision_failed');
  });

  it('keeps an unknown future phase readable', () => {
    const row = mcpServerDefinitionSchema.parse({
      id: 'x',
      name: 'x',
      status: 'preparing',
      preparation: { state: 'preparing', phase: 'download' },
    });
    expect(row.preparation?.phase).toBe('unknown');
  });

  it('reconnects a conversation server by session and server name', async () => {
    const raw = {
      session_id: 'sess 1',
      namespace: 'spotter',
      state: 'preparing',
      preparation: { state: 'preparing', phase: 'provision' },
    };
    const request = vi.fn((call: { decode: (value: unknown) => unknown }) =>
      Promise.resolve(call.decode(raw)),
    );
    const repository = new McpRepository({ request } as never);

    const answer = await repository.reconnectSessionMcpServer('sess 1', 'spotter');

    const call = request.mock.calls[0]?.[0] as unknown as { method: string; path: string };
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/v1/sessions/sess%201/mcp/spotter/reconnect');
    expect(answer.state).toBe('preparing');
    expect(answer.preparation?.phase).toBe('provision');
  });
});
