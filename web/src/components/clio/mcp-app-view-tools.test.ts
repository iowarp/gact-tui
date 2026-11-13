import type { TransportFrame } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_VIEW_TOOLS,
  McpAppViewTools,
  dispatchMcpAppToolCallFrame,
  viewToolsOverLimit,
} from './mcp-app-view-tools';

const identity = { sessionId: 'sess_1', appInstanceId: 'app_1', dataRef: 'ref' };
const highlight = {
  name: 'set_highlight',
  description: 'Highlight one reading.',
  inputSchema: { type: 'object', properties: { reading: { type: 'string' } } },
};

function client() {
  return {
    updateMcpAppTools: vi.fn(async () => ({ offered: ['app__board__set_highlight'] })),
    postMcpAppToolResult: vi.fn(async () => ({})),
  };
}

interface Sent {
  method: string;
  params: Record<string, unknown>;
}

/** A view that answers every host request the way the board fixture does. */
function view(tools: unknown[]) {
  const sent: Sent[] = [];
  const ask = async (method: string, params: Record<string, unknown>) => {
    sent.push({ method, params });
    await Promise.resolve();
    if (method === 'tools/list') return { tools };
    return { content: [{ type: 'text', text: 'Highlighted Outlet.' }] };
  };
  return { sent, ask };
}

function frame(payload: Record<string, unknown>): TransportFrame {
  return {
    cursor: '1',
    eventName: 'mcp_app_tool_call',
    receivedAt: '2026-11-13T00:00:00Z',
    data: {
      protocol_version: '0.3',
      type: 'mcp_app_tool_call',
      occurred_at: '2026-11-13T00:00:00Z',
      scope: { connection_id: 'local', session_id: 'sess_1' },
      payload,
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('McpAppViewTools', () => {
  it('lists the view tools only when the view declares the tools capability', async () => {
    const repository = client();
    const fake = view([highlight]);
    const tools = new McpAppViewTools(repository, identity, fake.ask);
    tools.declare({ availableDisplayModes: ['inline'] });
    tools.start();
    expect(fake.sent).toEqual([]);

    tools.declare({ tools: { listChanged: true } });
    tools.start();
    await vi.waitFor(() => expect(repository.updateMcpAppTools).toHaveBeenCalledTimes(1));
    const [, offered, holder] = repository.updateMcpAppTools.mock.calls[0] as unknown as [
      unknown,
      unknown[],
      string,
    ];
    expect(offered).toEqual([highlight]);
    expect(holder).toBeTruthy();
    expect(fake.sent[0]).toMatchObject({ method: 'tools/list' });

    tools.stop();
    expect(repository.updateMcpAppTools).toHaveBeenLastCalledWith(identity, [], holder);
  });

  it('forwards a streamed agent call to the view once and posts its result', async () => {
    const repository = client();
    const fake = view([highlight]);
    const tools = new McpAppViewTools(repository, identity, fake.ask);
    tools.declare({ tools: {} });
    tools.start();
    const call = {
      session_id: 'sess_1',
      app_instance_id: 'app_1',
      call_id: 'apcall_1',
      name: 'set_highlight',
      arguments: { reading: 'outlet' },
    };
    dispatchMcpAppToolCallFrame(frame(call));
    dispatchMcpAppToolCallFrame(frame(call)); // a repeated event runs the view tool once
    dispatchMcpAppToolCallFrame(frame({ ...call, app_instance_id: 'other', call_id: 'x' }));
    await vi.waitFor(() => expect(repository.postMcpAppToolResult).toHaveBeenCalledTimes(1));
    expect(repository.postMcpAppToolResult).toHaveBeenCalledWith(identity, 'apcall_1', {
      result: { content: [{ type: 'text', text: 'Highlighted Outlet.' }] },
    });
    expect(fake.sent.filter((m) => m.method === 'tools/call')).toEqual([
      expect.objectContaining({
        params: { name: 'set_highlight', arguments: { reading: 'outlet' } },
      }),
    ]);
    tools.stop();
  });

  it('offers nothing past the published limits and says why', async () => {
    const many = Array.from({ length: MAX_VIEW_TOOLS + 1 }, (_, i) => ({ name: `t${i}` }));
    expect(viewToolsOverLimit(many)).toMatch(/at most 64/);
    const huge = [{ name: 'big', inputSchema: { description: 'x'.repeat(64 * 1024) } }];
    expect(viewToolsOverLimit(huge)).toMatch(/over 64 KiB/);
    expect(viewToolsOverLimit([highlight])).toBeUndefined();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repository = client();
    const fake = view(many);
    const tools = new McpAppViewTools(repository, identity, fake.ask);
    tools.declare({ tools: {} });
    tools.start();
    await vi.waitFor(() => expect(repository.updateMcpAppTools).toHaveBeenCalled());
    expect((repository.updateMcpAppTools.mock.calls[0] as unknown[])[1]).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not offered to the agent/));
    tools.stop();
  });
});
