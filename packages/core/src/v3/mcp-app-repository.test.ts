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

  it('moves, pins and saves downloads through the same capability', async () => {
    const transport = new RecordingTransport([
      { display_mode: 'fullscreen', pinned: true },
      { display_mode: 'inline', pinned: true },
      { files: [{ name: 'plot.svg', path: 'plot.svg', artifact_id: 'art_1' }] },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.setMcpAppDisplayMode(identity, 'fullscreen')).resolves.toEqual({
      display_mode: 'fullscreen',
      pinned: true,
    });
    await repository.pinMcpApp(identity, true);
    const saved = await repository.saveMcpAppDownload(identity, { contents: [] });

    expect(saved.files[0]?.path).toBe('plot.svg');
    expect(
      transport.requests.map((request) => [request.method, request.path, request.body]),
    ).toEqual([
      [
        'PUT',
        '/v1/sessions/session%20root/mcp-apps/app%2Fone/display-mode?data_ref=opaque%20capability',
        { mode: 'fullscreen' },
      ],
      [
        'PUT',
        '/v1/sessions/session%20root/mcp-apps/app%2Fone/pin?data_ref=opaque%20capability',
        { pinned: true },
      ],
      [
        'POST',
        '/v1/sessions/session%20root/mcp-apps/app%2Fone/downloads?data_ref=opaque%20capability',
        { contents: [] },
      ],
    ]);
  });

  it('opens a view from a call and decodes a typed failure with the call to retry', async () => {
    const part = {
      id: 'p1',
      type: 'mcp_app',
      app_instance_id: 'app_1',
      data_ref: 'ref_1',
      resource_uri: 'ui://clock/view',
      source_server: 'clock',
      tool_name: 'clock_open',
      metadata: {},
    };
    const call = { server: 'clock', tool: 'open', arguments: { time: 3 } };
    const transport = new RecordingTransport([
      { part, saved_call: call, server_tools: ['open', 'set_time'] },
      { error: { reason: 'tool_unavailable', detail: 'not connected' }, saved_call: call },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.openMcpAppFromCall('s 1', call)).resolves.toMatchObject({
      ok: true,
      view: { appInstanceId: 'app_1', dataRef: 'ref_1', sourceServer: 'clock' },
      savedCall: { server: 'clock', tool: 'open', arguments: { time: 3 } },
      serverTools: ['open', 'set_time'],
    });
    await expect(repository.openMcpAppFromCall('s 1', call)).resolves.toMatchObject({
      ok: false,
      reason: 'tool_unavailable',
      detail: 'not connected',
      serverTools: [],
    });
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/s%201/mcp-apps/open',
      body: call,
    });
  });
});
