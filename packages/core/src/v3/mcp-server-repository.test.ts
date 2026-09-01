import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

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

const server = {
  id: 'mcp_ext_science',
  name: 'Science tools',
  status: 'ready',
  transport: 'http',
  tools_count: 1,
  tools: ['catalog_search'],
  spec: { transport: 'http', url: 'https://mcp.example.test' },
};

describe('MCP server repository', () => {
  it('covers scoped discovery, lifecycle, and provider inventories', async () => {
    const transport = new RecordingTransport([
      { servers: [server] },
      server,
      server,
      server,
      server,
      { tools: [{ name: 'catalog_search', description: 'Search the catalog.' }] },
      { resources: [{ name: 'Dataset guide', uri: 'resource://guide' }] },
      { prompts: [{ name: 'review-dataset', description: 'Review a dataset.' }] },
      undefined,
    ]);
    const repository = new ClioRepository(transport);

    await repository.mcpServers('ws science');
    await repository.mcpServer('science/tools');
    await repository.installMcpServer({
      name: 'Science tools',
      transport: 'http',
      url: 'https://mcp.example.test',
    });
    await repository.installMcpServer({
      name: 'Local science tools',
      transport: 'stdio',
      command: 'science-tools',
      args: ['serve'],
      env: { SCIENCE_STATE: 'D:\\science-state' },
    });
    await repository.reconnectMcpServer('science/tools');
    await repository.mcpServerInventory('science/tools', 'tools');
    await repository.mcpServerInventory('science/tools', 'resources');
    await repository.mcpServerInventory('science/tools', 'prompts');
    await repository.deleteMcpServer('science/tools');

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/v1/mcp/servers?workspace_id=ws%20science' },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools' },
      { method: 'POST', path: '/v1/mcp/servers' },
      { method: 'POST', path: '/v1/mcp/servers' },
      { method: 'POST', path: '/v1/mcp/servers/science%2Ftools/reconnect' },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools/tools' },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools/resources' },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools/prompts' },
      { method: 'DELETE', path: '/v1/mcp/servers/science%2Ftools' },
    ]);
    expect(transport.requests[2]?.body).toEqual({
      name: 'Science tools',
      transport: 'http',
      url: 'https://mcp.example.test',
    });
    expect(transport.requests[3]?.body).toEqual({
      name: 'Local science tools',
      transport: 'stdio',
      command: 'science-tools',
      args: ['serve'],
      env: { SCIENCE_STATE: 'D:\\science-state' },
    });
  });
});
