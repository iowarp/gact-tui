import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client, McpServerInfo } from '@clio/core';
import { McpPromptRow, McpResourceRow } from '../../src/routes/discovery/McpDetailRows.js';

afterEach(cleanup);

const SERVER: McpServerInfo = {
  id: 'demo',
  name: 'Demo MCP',
  status: 'ready',
  transport: 'stdio',
  tools_count: 0,
  tools: [],
};

function makeClient(): Client {
  return {
    mcpGetPrompt: vi.fn().mockResolvedValue({
      messages: [{ role: 'user', content: { text: 'summarize this' } }],
    }),
    mcpReadResource: vi.fn().mockResolvedValue({
      contents: [{ text: 'resource body' }],
    }),
    mcpSubscribeResource: vi.fn().mockResolvedValue({}),
    mcpUnsubscribeResource: vi.fn().mockResolvedValue({}),
  } as unknown as Client;
}

describe('McpDetailRows', () => {
  it('renders and hides prompt output', async () => {
    const client = makeClient();
    render(() => (
      <McpPromptRow
        s={SERVER}
        p={{ name: 'summarize', description: 'Summarize text' }}
        client={client}
      />
    ));

    fireEvent.click(screen.getByTestId('mcp-prompt-render-demo-summarize'));

    await waitFor(() => expect(screen.getByText(/summarize this/)).toBeTruthy());
    expect(client.mcpGetPrompt).toHaveBeenCalledWith('demo', 'summarize', {});

    fireEvent.click(screen.getByTestId('mcp-prompt-render-demo-summarize'));
    await waitFor(() => expect(screen.queryByText(/summarize this/)).toBeNull());
  });

  it('previews resources and toggles subscription state', async () => {
    const client = makeClient();
    render(() => (
      <McpResourceRow
        s={SERVER}
        r={{ uri: 'file:///tmp/demo.txt', name: 'Demo file' }}
        client={client}
      />
    ));

    fireEvent.click(screen.getByTestId('mcp-resource-preview-demo-file:///tmp/demo.txt'));
    await waitFor(() => expect(screen.getByText('resource body')).toBeTruthy());
    expect(client.mcpReadResource).toHaveBeenCalledWith('demo', 'file:///tmp/demo.txt');

    fireEvent.click(screen.getByTestId('mcp-resource-sub-demo-file:///tmp/demo.txt'));
    await waitFor(() => expect(screen.getByText('✓ Subscribed')).toBeTruthy());
    expect(client.mcpSubscribeResource).toHaveBeenCalledWith('demo', 'file:///tmp/demo.txt');

    fireEvent.click(screen.getByTestId('mcp-resource-sub-demo-file:///tmp/demo.txt'));
    await waitFor(() => expect(screen.getByText('Subscribe')).toBeTruthy());
    expect(client.mcpUnsubscribeResource).toHaveBeenCalledWith('demo', 'file:///tmp/demo.txt');
  });
});
