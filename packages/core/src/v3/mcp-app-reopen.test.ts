import { describe, expect, it } from 'vitest';
import { decodeMcpAppReopen, savedMcpAppCalls } from './mcp-app-reopen.js';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

const saved = {
  server: 'boards',
  tool: 'open_board',
  arguments: { title: 'Q3', count: 4 },
  display_mode: 'fullscreen',
  resource_uri: 'ui://boards/view',
  label: 'Open a board',
};

describe('MCP App reopening', () => {
  it('posts the app instance and decodes the fresh view', async () => {
    const transport = new RecordingTransport([
      {
        part: {
          id: 'mcp_app_new',
          type: 'mcp_app',
          app_instance_id: 'new',
          data_ref: 'ref',
          resource_uri: 'ui://boards/view',
          source_server: 'boards',
          tool_name: 'boards_open_board',
          mime_type: 'text/html;profile=mcp-app',
          metadata: { display_mode: 'fullscreen', stream_source: 'reopen' },
        },
        saved_call: { ...saved, reopened_from: 'old' },
      },
    ]);
    const result = await new ClioRepository(transport).reopenMcpApp('session 1', 'old');

    expect(transport.requests[0]?.path).toBe('/v1/sessions/session%201/mcp-apps/reopen');
    expect(transport.requests[0]?.body).toEqual({ app_instance_id: 'old' });
    expect(result).toEqual({
      ok: true,
      savedCall: { ...saved, reopened_from: 'old' },
      view: {
        appInstanceId: 'new',
        dataRef: 'ref',
        resourceUri: 'ui://boards/view',
        sourceServer: 'boards',
        toolName: 'boards_open_board',
        displayMode: 'fullscreen',
      },
    });
  });

  it('asks whether CLIO still holds a view', async () => {
    const transport = new RecordingTransport([{ live: false }]);
    const live = await new ClioRepository(transport).mcpAppLive({
      sessionId: 's',
      appInstanceId: 'a',
      dataRef: 'r',
    });
    expect(live).toBe(false);
    expect(transport.requests[0]?.path).toBe('/v1/sessions/s/mcp-apps/a/live?data_ref=r');
  });

  it('keeps a failed replay as a reason with the saved call', () => {
    expect(
      decodeMcpAppReopen({
        error: { reason: 'tool_error', detail: 'The board service is unavailable right now.' },
        saved_call: saved,
      }),
    ).toEqual({
      ok: false,
      reason: 'tool_error',
      detail: 'The board service is unavailable right now.',
      savedCall: saved,
    });
    expect(
      decodeMcpAppReopen({ error: { reason: 'no_saved_call', detail: 'x' }, saved_call: null }),
    ).toMatchObject({ ok: false, savedCall: null });
  });

  it('reads saved calls from session metadata and skips malformed rows', () => {
    expect(
      savedMcpAppCalls({ mcp_app_calls: { a: saved, b: { server: 1 } }, other: true }),
    ).toEqual({ a: saved });
    expect(savedMcpAppCalls(undefined)).toEqual({});
  });
});
