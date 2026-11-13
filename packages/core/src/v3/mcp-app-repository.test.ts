import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

const identity = {
  sessionId: 'session root',
  appInstanceId: 'app/one',
  dataRef: 'opaque capability',
};

describe('ClioRepository MCP App adapter', () => {
  it('decodes the descriptor and binds every action to the same opaque capability', async () => {
    const transport = new RecordingTransport([
      {
        protocol_version: '2026-01-26',
        resource: {
          uri: 'ui://vigil/viewer',
          mime_type: 'text/html;profile=mcp-app',
          html: '<main>viewer</main>',
          csp: {},
          permissions: {},
        },
        tool_input: { run: '42' },
        tool_result: { structuredContent: { ready: true } },
        sandbox_url: 'http://localhost:8788/sandbox',
      },
      { content: [] },
      { contents: [] },
      {},
      { message_id: 'msg_1', delivery: 'queued', state: 'waiting' },
      undefined,
    ]);
    const repository = new ClioRepository(transport);

    await repository.mcpAppDescriptor(identity);
    await repository.callMcpAppTool(identity, { name: 'select', arguments: { row: 2 } });
    await repository.readMcpAppResource(identity, 'data://result');
    await repository.updateMcpAppModelContext(identity, { selection: [2] });
    await repository.postMcpAppMessage(identity, {
      role: 'user',
      content: [{ type: 'text', text: 'Inspect row 2' }],
    });
    await repository.closeMcpApp(identity);

    expect(transport.requests.map((request) => request.path)).toEqual([
      '/v1/sessions/session%20root/mcp-apps/app%2Fone?data_ref=opaque%20capability',
      '/v1/sessions/session%20root/mcp-apps/app%2Fone/tools/call?data_ref=opaque%20capability',
      '/v1/sessions/session%20root/mcp-apps/app%2Fone/resources/read?data_ref=opaque%20capability',
      '/v1/sessions/session%20root/mcp-apps/app%2Fone/model-context?data_ref=opaque%20capability',
      '/v1/sessions/session%20root/mcp-apps/app%2Fone/messages?data_ref=opaque%20capability',
      '/v1/sessions/session%20root/mcp-apps/app%2Fone?data_ref=opaque%20capability',
    ]);
    expect(JSON.stringify(transport.requests)).not.toContain('<main>viewer</main>');
  });

  it('opens a view from a call and decodes a typed failure with the call to retry', async () => {
    const part = {
      type: 'mcp_app',
      app_instance_id: 'app_1',
      data_ref: 'ref_1',
      resource_uri: 'ui://clock/view',
      source_server: 'clock',
      tool_name: 'clock_open',
    };
    const call = { server: 'clock', tool: 'open', arguments: { time: 3 } };
    const transport = new RecordingTransport([
      { part: { ...part, id: 'p1', metadata: {} }, saved_call: call, server_tools: ['open', 'set_time'] },
      { error: { reason: 'mcp_app_tool_not_found', detail: 'no tool' }, saved_call: call },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.openMcpAppFromCall('s 1', call)).resolves.toEqual({
      part,
      saved_call: call,
      server_tools: ['open', 'set_time'],
    });
    await expect(repository.openMcpAppFromCall('s 1', call)).resolves.toEqual({
      error: { reason: 'mcp_app_tool_not_found', detail: 'no tool' },
      saved_call: call,
    });
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/s%201/mcp-apps/open',
      body: call,
    });
  });
});
