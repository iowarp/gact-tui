import type { McpAppDescriptor } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  MCP_APP_SERVICE_CONTEXT_KEY,
  mcpAppServiceHostContext,
  mcpAppServiceUrl,
} from './mcp-app-service';

const identity = { sessionId: 'sess_1', appInstanceId: 'app1', dataRef: 'cap-1' };
const servicePath = '/v1/sessions/sess_1/mcp-apps/app1/service/cap-1/';

function descriptor(serviceUrl: string | null): McpAppDescriptor {
  return {
    protocol_version: '2026-01-26',
    resource: {
      uri: 'ui://x/view',
      mime_type: 'text/html;profile=mcp-app',
      html: '',
      csp: {},
      permissions: {},
    },
    tool_input: {},
    tool_result: {},
    sandbox_url: 'http://localhost:8100/v1/sessions/sess_1/mcp-apps/app1/sandbox?data_ref=cap-1',
    service_url: serviceUrl,
  };
}

describe('mcp app service', () => {
  it('gives the view its own service route on the sandbox origin', () => {
    const url = `http://localhost:8100${servicePath}`;
    expect(mcpAppServiceUrl(descriptor(url), identity)).toBe(url);
    expect(mcpAppServiceHostContext(descriptor(url), identity)).toEqual({
      [MCP_APP_SERVICE_CONTEXT_KEY]: { url },
    });
  });

  it('gives no address when there is no service', () => {
    expect(mcpAppServiceHostContext(descriptor(null), identity)).toEqual({});
  });

  it.each([
    `http://127.0.0.1:19700${servicePath}`,
    'http://localhost:8100/v1/sessions/sess_1/mcp-apps/other/service/cap-1/',
    `http://localhost:8100${servicePath}?token=1`,
    'not a url',
  ])('refuses %s', (url) => {
    expect(mcpAppServiceUrl(descriptor(url), identity)).toBeUndefined();
  });
});
