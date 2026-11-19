import type { BrowserPage } from '@clio/core/v3';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkedLink, McpAppRpcFailure, resolveDisplayMode } from './mcp-app-bridge';
import { mcpAppStyleVariables } from './mcp-app-host-styles';
import {
  OPEN_MCP_APP_TAB_EVENT,
  openMcpAppInTab,
  resetMcpAppLiveSet,
  returnMcpAppToConversation,
  useMcpAppLiveSetStore,
} from './mcp-app-live-set';
import { McpAppSurface, type McpAppSurfaceHandle } from './mcp-app-surface';

const ORIGIN = 'http://localhost:8788';

function repository() {
  return {
    mcpAppDescriptor: vi.fn(
      async (identity: { sessionId: string; appInstanceId: string; dataRef: string }) => ({
        protocol_version: '2026-01-26',
        resource: {
          uri: 'ui://fixture/panel',
          mime_type: 'text/html;profile=mcp-app',
          html: '<main>panel</main>',
          csp: {},
          permissions: {},
        },
        tool_input: { topic: 'x' },
        tool_result: { content: [] },
        sandbox_url: `${ORIGIN}/v1/sessions/${identity.sessionId}/mcp-apps/${identity.appInstanceId}/sandbox?data_ref=${identity.dataRef}`,
        display_mode: 'inline' as const,
        pinned: false,
      }),
    ),
    callMcpAppTool: vi.fn(async () => ({ content: [] })),
    readMcpAppResource: vi.fn(async () => ({ contents: [] })),
    updateMcpAppModelContext: vi.fn(async () => ({})),
    postMcpAppMessage: vi.fn(async () => ({ message_id: 'm', delivery: 'queued', state: 'w' })),
    saveMcpAppDownload: vi.fn(async () => ({
      files: [{ name: 'samples.csv', path: 'samples.csv', artifact_id: 'art_1' }],
    })),
    openBrowserPage: vi.fn(
      async () =>
        ({ id: 'page_1', title: 'Example', host: 'example.org' }) as unknown as BrowserPage,
    ),
    setMcpAppDisplayMode: vi.fn(async () => ({
      display_mode: 'fullscreen' as const,
      pinned: true,
    })),
    pinMcpApp: vi.fn(async () => ({ display_mode: 'inline' as const, pinned: true })),
    closeMcpApp: vi.fn(async () => undefined),
    updateMcpAppTools: vi.fn(async () => ({ offered: [] })),
    postMcpAppToolResult: vi.fn(async () => ({})),
  };
}

const target = {
  label: 'open_panel',
  appInstanceId: 'app_1',
  dataRef: 'ref',
  sessionId: 'sess',
  resourceUri: 'ui://fixture/panel',
  sourceServer: 'fixture',
  toolName: 'open_panel',
};

async function mountView(
  client: ReturnType<typeof repository>,
  extra: Record<string, unknown> = {},
) {
  const handle = createRef<McpAppSurfaceHandle>();
  render(
    <McpAppSurface
      {...target}
      ref={handle}
      repository={client}
      {...(extra as Record<string, never>)}
    />,
  );
  const iframe = await screen.findByTitle<HTMLIFrameElement>('open_panel, interactive view');
  const view = iframe.contentWindow!;
  const post = vi.spyOn(view, 'postMessage');
  const send = (data: Record<string, unknown>) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { jsonrpc: '2.0', ...data },
          origin: ORIGIN,
          source: view,
        }),
      );
    });
  const reply = (id: unknown) =>
    post.mock.calls.map(([message]) => message as Record<string, unknown>).find((m) => m.id === id);
  send({
    id: 'init',
    method: 'ui/initialize',
    params: {
      protocolVersion: '2026-01-26',
      appInfo: { name: 'panel', version: '1' },
      appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    },
  });
  send({ method: 'ui/notifications/initialized', params: {} });
  return { handle, post, send, reply, iframe };
}

beforeEach(resetMcpAppLiveSet);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MCP App host features', () => {
  it('offers inline and fullscreen and the draft link and download capabilities', async () => {
    const { reply } = await mountView(repository());
    const result = reply('init')?.result as {
      hostCapabilities: Record<string, unknown>;
      hostContext: Record<string, unknown>;
    };
    expect(result.hostContext.availableDisplayModes).toEqual(['inline', 'fullscreen']);
    expect(result.hostContext.displayMode).toBe('inline');
    expect(result.hostCapabilities).toMatchObject({ openLinks: {}, downloadFile: {} });
  });

  it('reports fullscreen in a tab and hands a granted mode change to the owner', async () => {
    const onDisplayModeChange = vi.fn();
    const { reply, send } = await mountView(repository(), {
      placement: 'tab',
      onDisplayModeChange,
    });
    const init = reply('init')?.result as { hostContext: { displayMode: string } } | undefined;
    expect(init?.hostContext).toEqual(expect.objectContaining({ displayMode: 'fullscreen' }));
    send({ id: 'pip', method: 'ui/request-display-mode', params: { mode: 'pip' } });
    expect(reply('pip')?.result).toEqual({ mode: 'fullscreen' });
    send({ id: 'in', method: 'ui/request-display-mode', params: { mode: 'inline' } });
    expect(reply('in')?.result).toEqual({ mode: 'inline' });
    await waitFor(() => expect(onDisplayModeChange).toHaveBeenCalledWith('inline'));
  });

  it('opens https links in the in-app browser and refuses other schemes with a reason', async () => {
    const client = repository();
    const onBrowserPage = vi.fn();
    const { reply, send } = await mountView(client, { onBrowserPage });
    send({ id: 'web', method: 'ui/open-link', params: { url: 'https://example.org/' } });
    await waitFor(() => expect(reply('web')?.result).toEqual({}));
    expect(client.openBrowserPage).toHaveBeenCalledWith('sess', 'https://example.org/');
    expect(onBrowserPage).toHaveBeenCalledWith(expect.objectContaining({ id: 'page_1' }));

    send({ id: 'file', method: 'ui/open-link', params: { url: 'file:///etc/hostname' } });
    await waitFor(() =>
      expect(reply('file')?.error).toEqual(
        expect.objectContaining({
          code: -32000,
          data: { reason: 'unsupported_scheme', scheme: 'file' },
        }),
      ),
    );
    expect(client.openBrowserPage).toHaveBeenCalledTimes(1);
  });

  it('saves a download into the workspace and returns the saved path', async () => {
    const client = repository();
    const onDownloaded = vi.fn();
    const { reply, send } = await mountView(client, { onDownloaded });
    const params = {
      contents: [{ type: 'resource', resource: { uri: 'file:///samples.csv', text: 'a' } }],
    };
    send({ id: 'dl', method: 'ui/download-file', params });
    await waitFor(() =>
      expect(reply('dl')?.result).toEqual({
        files: [{ name: 'samples.csv', path: 'samples.csv', artifact_id: 'art_1' }],
      }),
    );
    expect(client.saveMcpAppDownload).toHaveBeenCalledWith(
      { sessionId: 'sess', appInstanceId: 'app_1', dataRef: 'ref' },
      params,
    );
    expect(onDownloaded).toHaveBeenCalled();
  });

  it('reports context to the owner after the server accepted it', async () => {
    const onModelContext = vi.fn();
    const { reply, send } = await mountView(repository(), { onModelContext });
    send({ id: 'ctx', method: 'ui/update-model-context', params: { structuredContent: { t: 3 } } });
    await waitFor(() => expect(reply('ctx')?.result).toEqual({}));
    expect(onModelContext).toHaveBeenCalledWith({ structuredContent: { t: 3 } });
  });

  it('calls the view’s own tools through the imperative handle', async () => {
    const { handle, post, send } = await mountView(repository());
    let result: unknown;
    const pending = handle.current!.callAppTool('highlight', { atom: 4 }).then((value) => {
      result = value;
    });
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'tools/call',
          params: { name: 'highlight', arguments: { atom: 4 } },
        }),
        ORIGIN,
      ),
    );
    const request = post.mock.calls
      .map(([message]) => message as { id?: string; method?: string })
      .find((message) => message.method === 'tools/call');
    send({ id: request!.id, result: { content: [{ type: 'text', text: 'done' }] } });
    await pending;
    expect(result).toEqual({ content: [{ type: 'text', text: 'done' }] });
  });

  it('answers unknown methods with method-not-found and a reason', async () => {
    const { reply, send } = await mountView(repository());
    send({ id: 'x', method: 'ui/unknown', params: {} });
    await waitFor(() =>
      expect(reply('x')?.error).toEqual(
        expect.objectContaining({ code: -32601, data: { reason: 'unsupported_method' } }),
      ),
    );
  });
});

describe('host styles', () => {
  it("hands views CLIO's notebook tokens as the standardized variables", async () => {
    const root = document.documentElement;
    root.style.setProperty('--background', '#f3efe6');
    root.style.setProperty('--foreground', '#2b2a26');
    root.style.setProperty('--info', '#3a6690');
    root.style.setProperty('--radius', '0.5rem');
    try {
      const variables = mcpAppStyleVariables();
      expect(variables['--color-background-primary']).toBe('#f3efe6');
      expect(variables['--color-text-primary']).toBe('#2b2a26');
      expect(variables['--color-background-info']).toBe(
        'color-mix(in oklab, #3a6690 14%, #f3efe6)',
      );
      expect(variables['--border-radius-md']).toBe('calc(0.5rem - 2px)');
      expect(variables).not.toHaveProperty('--color-text-secondary');
      const { reply } = await mountView(repository());
      const init = reply('init')?.result as {
        hostContext: { theme: string; styles: { variables: Record<string, string> } };
      };
      expect(init.hostContext.theme).toBe('light');
      expect(init.hostContext.styles.variables['--color-background-primary']).toBe('#f3efe6');
    } finally {
      for (const token of ['--background', '--foreground', '--info', '--radius'])
        root.style.removeProperty(token);
    }
  });
});

describe('display mode and link rules', () => {
  it('resolves display mode requests', () => {
    expect(resolveDisplayMode('fullscreen', 'inline', undefined)).toBe('fullscreen');
    expect(resolveDisplayMode('pip', 'inline', undefined)).toBe('inline');
    expect(resolveDisplayMode('fullscreen', 'surface', undefined)).toBe('inline');
    const inlineOnly = { availableDisplayModes: Array.of('inline') };
    expect(resolveDisplayMode('fullscreen', 'inline', inlineOnly)).toBe('inline');
  });

  it('accepts only http and https links', () => {
    expect(checkedLink('https://example.org/a').href).toBe('https://example.org/a');
    expect(() => checkedLink('javascript:alert(1)')).toThrow(McpAppRpcFailure);
    expect(() => checkedLink('not a url')).toThrow('not a valid address');
  });
});

describe('the live set', () => {
  it('moves an app into a tab and back, and closes an older app whose tab leaves', () => {
    const client = repository();
    const opened = vi.fn();
    window.addEventListener(OPEN_MCP_APP_TAB_EVENT, opened);
    useMcpAppLiveSetStore.setState({ apps: {}, latest: { sess: 'app_1' } });

    openMcpAppInTab(target, client);
    expect(useMcpAppLiveSetStore.getState().apps.app_1?.placement).toBe('tab');
    expect(client.setMcpAppDisplayMode).toHaveBeenCalledWith(
      { sessionId: 'sess', appInstanceId: 'app_1', dataRef: 'ref' },
      'fullscreen',
    );
    expect(opened).toHaveBeenCalledTimes(1);

    returnMcpAppToConversation('app_1');
    expect(useMcpAppLiveSetStore.getState().apps.app_1?.placement).toBe('inline');
    expect(client.setMcpAppDisplayMode).toHaveBeenLastCalledWith(
      expect.objectContaining({ appInstanceId: 'app_1' }),
      'inline',
    );

    openMcpAppInTab(target, client);
    useMcpAppLiveSetStore.setState({ latest: { sess: 'app_2' } });
    returnMcpAppToConversation('app_1');
    expect(useMcpAppLiveSetStore.getState().apps.app_1?.placement).toBe('ended');
    expect(client.closeMcpApp).toHaveBeenCalledWith(
      expect.objectContaining({ appInstanceId: 'app_1' }),
    );
    window.removeEventListener(OPEN_MCP_APP_TAB_EVENT, opened);
  });
});
