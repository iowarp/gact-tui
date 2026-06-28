import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client, McpServerInfo } from '@clio/core';
import { McpServerCard } from '../../src/routes/discovery/McpServerCard.js';

afterEach(cleanup);

const SERVER: McpServerInfo = {
  id: 'demo',
  name: 'Demo MCP',
  status: 'ready',
  transport: 'stdio',
  tools_count: 1,
  tools: ['listed-tool'],
};

function makeClient(): Client {
  return {
    mcpServerTools: vi.fn().mockResolvedValue({
      tools: [{ name: 'echo', description: 'Echo input' }],
    }),
    mcpServerResources: vi.fn().mockResolvedValue({
      resources: [{ uri: 'file:///tmp/demo.txt', name: 'Demo file' }],
    }),
    mcpServerPrompts: vi.fn().mockResolvedValue({
      prompts: [{ name: 'summarize', description: 'Summarize text' }],
    }),
    mcpServerResourceTemplates: vi.fn().mockResolvedValue({
      templates: [{ uriTemplate: 'file:///{path}', description: 'Any file' }],
    }),
  } as unknown as Client;
}

describe('McpServerCard', () => {
  it('loads and renders expanded server detail sections', async () => {
    const client = makeClient();
    render(() => (
      <McpServerCard
        s={SERVER}
        client={client}
        busy={false}
        reconnectUnsupported={false}
        onReconnect={() => undefined}
        onUninstall={() => undefined}
      />
    ));

    fireEvent.click(screen.getByTestId('mcp-expand-demo'));

    await waitFor(() => expect(screen.getByText('Tools')).toBeTruthy());
    expect(screen.getByText('Resources')).toBeTruthy();
    expect(screen.getByText('Prompts')).toBeTruthy();
    expect(screen.getByText('Resource templates')).toBeTruthy();
    expect(screen.getByText('echo')).toBeTruthy();
    expect(screen.getByText('file:///tmp/demo.txt')).toBeTruthy();
    expect(screen.getByText('summarize')).toBeTruthy();
    expect(screen.getByText('file:///{path}')).toBeTruthy();
  });
});
