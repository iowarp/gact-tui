import type { McpServerInfo } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  filterMcpServers,
  isReconnectUnsupportedError,
} from '../../src/routes/discovery/McpPageModel.js';

const servers: McpServerInfo[] = [
  {
    id: 'fs',
    name: 'Filesystem',
    status: 'ready',
    transport: 'stdio',
    tools_count: 2,
    tools: ['read_file', 'write_file'],
  },
  {
    id: 'gh',
    name: 'GitHub',
    status: 'ready',
    transport: 'http',
    tools_count: 2,
    tools: ['search', 'issues'],
  },
];

describe('McpPageModel', () => {
  it('filters MCP servers by id, name, or tool name', () => {
    expect(filterMcpServers(servers, '').map((server) => server.id)).toEqual(['fs', 'gh']);
    expect(filterMcpServers(servers, ' file ').map((server) => server.id)).toEqual(['fs']);
    expect(filterMcpServers(servers, 'GITHUB').map((server) => server.id)).toEqual(['gh']);
    expect(filterMcpServers(servers, 'issues').map((server) => server.id)).toEqual(['gh']);
    expect(filterMcpServers(servers, 'missing')).toEqual([]);
  });

  it('classifies only 404 reconnect errors as unsupported-route errors', () => {
    expect(isReconnectUnsupportedError({ status: 404 })).toBe(true);
    expect(isReconnectUnsupportedError({ status: 500 })).toBe(false);
    expect(isReconnectUnsupportedError(new Error('offline'))).toBe(false);
    expect(isReconnectUnsupportedError(null)).toBe(false);
  });
});
