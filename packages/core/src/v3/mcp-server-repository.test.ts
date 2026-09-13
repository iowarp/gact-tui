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

const configuration = {
  name: 'web',
  configured: true,
  scope: 'user',
  status: 'ready',
  transport: 'stdio',
  tools_count: 2,
  tools: ['web_search', 'web_fetch'],
  spec: { transport: 'stdio', command: 'uvx', args: ['clio-kit', 'mcp-server', 'web'] },
  retryable: false,
};

describe('MCP server repository', () => {
  it('covers scoped discovery, lifecycle, and provider inventories', async () => {
    const transport = new RecordingTransport([
      configuration,
      configuration,
      { ...configuration, configured: false, status: 'local_fallback', removed: true },
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

    await repository.mcpConfiguration('web/search');
    await repository.configureMcpServer('web/search', {
      transport: 'stdio',
      command: 'uvx',
      args: ['clio-kit', 'mcp-server', 'web', '--remote-url', 'http://search:8089'],
    });
    await repository.removeMcpConfiguration('web/search');
    await repository.mcpServers('ws science', undefined, { sessionId: 'sess/earth' });
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
      { method: 'GET', path: '/v1/mcp/configuration/web%2Fsearch' },
      { method: 'PUT', path: '/v1/mcp/configuration/web%2Fsearch' },
      { method: 'DELETE', path: '/v1/mcp/configuration/web%2Fsearch' },
      {
        method: 'GET',
        path: '/v1/mcp/servers?workspace_id=ws%20science&session_id=sess%2Fearth',
      },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools' },
      { method: 'POST', path: '/v1/mcp/servers' },
      { method: 'POST', path: '/v1/mcp/servers' },
      { method: 'POST', path: '/v1/mcp/servers/science%2Ftools/reconnect' },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools/tools' },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools/resources' },
      { method: 'GET', path: '/v1/mcp/servers/science%2Ftools/prompts' },
      { method: 'DELETE', path: '/v1/mcp/servers/science%2Ftools' },
    ]);
    expect(transport.requests[1]?.body).toEqual({
      transport: 'stdio',
      command: 'uvx',
      args: ['clio-kit', 'mcp-server', 'web', '--remote-url', 'http://search:8089'],
    });
    expect(transport.requests[5]?.body).toEqual({
      name: 'Science tools',
      transport: 'http',
      url: 'https://mcp.example.test',
    });
    expect(transport.requests[6]?.body).toEqual({
      name: 'Local science tools',
      transport: 'stdio',
      command: 'science-tools',
      args: ['serve'],
      env: { SCIENCE_STATE: 'D:\\science-state' },
    });
  });
});
